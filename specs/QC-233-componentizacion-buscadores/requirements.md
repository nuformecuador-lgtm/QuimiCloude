# QC-233 — componentizacion-buscadores · requirements

| key | zona | complexity | rama | depends_on |
|---|---|---|---|---|
| QC-233 | frontend | high | `feature/QC-233-componentizacion-buscadores` | QC-231 (mergeada en `dev`) |

**Estado:** borrador del `spec_author` (2026-10-08), pendiente de aprobación humana. Quedan abiertas
P1–P5.

## Alcance (issue QC-233 y `_trabajo/marca/auditoria-componentes.md > 2.l` y `> 5`, fila 6)

Es una refactorización **de cero cambio**, como QC-231. El rediseño es QC-227.

Hoy hay seis buscadores asíncronos (autocompletado con consulta paginada al servidor). Solo uno pasa
por `AsyncAutocomplete`: `OrderCustomerPicker`. Los otros cinco reimplementan cada uno la misma
composición de los primitivos de `components/ui/autocomplete.tsx` con `useAsyncPaginatedOptions`:

- `ProductPicker` (`app/(private)/produccion/formulas/components/product-picker.tsx`);
- `RecipePicker` (`app/(private)/pedidos/components/recipe-picker.tsx`);
- `PackagingSelect` (`app/(private)/pedidos/components/packaging-select.tsx`);
- `ProductNamePicker` (`app/(private)/inventario/components/product-name-picker.tsx`);
- `PresentationSelect` (`components/shared/presentation-select.tsx`).

Lo que entra:

- **`AsyncAutocomplete` pasa a ser el único sitio** que compone esos primitivos con el hook. Gana,
  como props opcionales, lo que hoy le falta a los cinco: la primera página precargada, las opciones
  excluidas, el reinicio por dependencia, la forma del error de carga, la opción no elegible, el
  texto del campo controlado por el consumidor, y los `data-testid`, clases y textos de cada sitio.
- **Los cinco buscadores pasan a delegar en `AsyncAutocomplete`.** Conservan su archivo, su nombre,
  sus exports y sus props. Conservan también lo que es suyo: la Server Action que consultan, el
  mapeo a opciones, la regla de cuándo se retira una elección y las piezas de campo (etiqueta, input
  oculto o espejo, error del campo, ayuda, aviso de permiso, alta en línea).
- **Una guardia** que impide volver a componer los primitivos de autocompletado fuera de
  `AsyncAutocomplete`, con sus excepciones con nombre.

### Lo que NO entra
- **Cambios visuales o de comportamiento** (D2). Las dos presentaciones que conviven hoy (la de
  `AsyncAutocomplete` y la de los cinco) se conservan. Unificarlas es QC-227.
- **Las piezas de campo:** etiqueta, error del campo, inputs ocultos o espejo. Son terreno de QC-232
  (campos) (D4). QC-233 no crea `TextField`, `SelectField` ni `FieldError`.
- **Los selects no asíncronos** (`SharedSelect`, `UnitSelect`, `PresentationUnitSelect`,
  `MeasurementUnitSelect`, `RecipeVersionSelect`): son campos, QC-232 (D4). Pendiente de P5.
- **Las barras de búsqueda de las listas** (la de la `DataTable` y los filtros de la vitrina de
  proveedores): no son buscadores de opciones. Pendiente de P5.
- **Llevar el `ErrorState` entero, con su referencia, a los buscadores.** Es la Opción A que QC-71
  R17 dejó descartada y «candidata a ficha propia». Pendiente de P4.
- **`OrderCustomerPicker`:** ya pasa por `AsyncAutocomplete`, así que su archivo no se toca.
- **Los archivos en vuelo de QC-223 y QC-96** (D3). Lista y riesgo en `design.md > 5`, y P1.

## Decisiones cerradas (no reabrir)

| # | Fecha | Decisión | Requisitos |
|---|---|---|---|
| D1 | 2026-10-08 | La auditoría de componentización se reparte en QC-231 (piezas base), QC-232 (formularios, borrados, campos y acciones por fila) y QC-233 (buscadores), todas antes de QC-227 (QC-231 D1) | R6, R7, R18 |
| D2 | 2026-10-08 | Sin cambios visuales ni de comportamiento. El rediseño es QC-227 | R1, R2, R3, R4, R5, R17 |
| D3 | 2026-10-08 | No se tocan archivos en vuelo de otras personas: QC-223 (Christian, en curso) y QC-96 (Christian, en revisión). Los choques se anotan | R21 |
| D4 | 2026-10-08 | QC-232 (formularios, borrados, campos y acciones por fila) es otra ficha: QC-233 no entra en su terreno | R18, R21 |
| D5 | 2026-10-08 | Ninguna dependencia nueva | R22 |
| D6 | 2026-10-08 | Mismo enfoque de «cero cambio» que QC-231: paridad con snapshots congelados antes de tocar código, árbol accesible y capturas antes/después; una guardia que impide reintroducir copias locales, con excepciones con nombre | R1, R3, R20 |

## Glosario
- **Buscador:** cada uno de los seis componentes de arriba: los cinco que migran y
  `OrderCustomerPicker`.
- **Primitivos de autocompletado:** los exports de `components/ui/autocomplete.tsx`.
- **Estado del desplegable:** cada una de estas situaciones de un buscador:
  - **cerrado**, con y sin una elección hecha;
  - **abierto con filas**;
  - **cargando** la primera página;
  - **cargando más**, al llegar al final del scroll;
  - **hay más** (solo `ProductPicker` lo anuncia);
  - **vacío**;
  - **error de carga** (en `PackagingSelect`, con un error de catálogo y con el inesperado);
  - **con una opción no elegible** (`PackagingSelect`, y `PresentationSelect` con `requireContent`);
  - **sin permiso** (`PackagingSelect`);
  - **alta en línea abierta** (`PresentationSelect`).
- **Árbol accesible:** el de QC-231. Para cada elemento: su rol y su nombre accesible, sus estados
  ARIA, su `data-testid` y el conjunto de clases de su `className`. Incluye los portales.
- **Archivos de QC-223:** los seis que QC-231 identificó (`specs/QC-231-…/requirements.md > Archivos
  D11`, bloque QC-223), más los que P1 confirme.

## Requisitos (EARS)

### Cero cambio

**R1.** El sistema DEBE presentar, en cada buscador y en cada estado del desplegable que le aplique,
el **mismo árbol accesible** antes y después de esta feature. No hay ninguna excepción declarada.

**R2.** Cada buscador DEBE conservar su comportamiento:
- a qué Server Action consulta, con qué `page`, `pageSize`, `search` y `filters`;
- cuándo consulta: el rebote de 400 ms solo en la primera página de una búsqueda escrita, sin rebote
  con la búsqueda vacía ni en las páginas siguientes, y nunca con el desplegable cerrado;
- cuándo pide la página siguiente: a 48 px o menos del final del scroll;
- lo que viaja en el `FormData`;
- cuándo se retira una elección y qué se avisa al consumidor (incluido el `null`);
- lo que se anuncia a la tecnología de asistencia;
- el teclado y el foco que pone el primitivo.

**R3.** Por cada buscador DEBE existir una captura «antes», hecha antes de tocar código de
producción, y una «después» de la misma pantalla, en el mismo estado del desplegable y con los mismos
datos del seed demo (QC-230). El reviewer DEBE dejar constancia de que no difieren.

**R4.** Los tests que ya existen DEBEN seguir pasando **sin cambiar lo que afirman**. En concreto, NO
DEBEN editarse:
- `tests/unit/async-autocomplete.test.tsx` y los de `OrderCustomerPicker`;
- los tests de los cinco buscadores y de sus pantallas;
- las guardias que leen los archivos de los buscadores: `guard-identificador-de-request`,
  `guard-piezas-base`, `guard-pantalla-pedidos-se-amplia`, `guard-catalogo-de-errores`, y los
  contratos `recipe-route-contract`, `product-route-contract` y `inventario/module-contract`;
- los snapshots de paridad de QC-231.

La única excepción es un test que pase a importar algo desde `AsyncAutocomplete` con las mismas
aserciones y los mismos `data-testid`. Cada una se anota en el impl.

**R5.** Cada buscador DEBE conservar su nombre, sus props y sus exports (componentes, tipos y
constantes). Ningún consumidor y ningún barrel DEBE necesitar cambiar para seguir compilando.

### Un solo componente

**R6.** El sistema DEBE componer los primitivos de autocompletado con `useAsyncPaginatedOptions` en
**un único** componente compartido, `AsyncAutocomplete`. Los seis buscadores DEBEN pintar su campo y
su desplegable a través de él.

**R7.** Ningún archivo de producción de `app/`, `components/` o `hooks/` DEBE importar los primitivos
de autocompletado ni llamar a `useAsyncPaginatedOptions`, salvo `AsyncAutocomplete` y las excepciones
con nombre de R20.

**R8.** DONDE el consumidor pase una primera página precargada, CUANDO se pida la página 1 con la
búsqueda vacía (tras recortar espacios), `AsyncAutocomplete` DEBE devolver esa página sin consultar al
servidor. Con búsqueda, o en las páginas siguientes, DEBE consultar.

**R9.** DONDE el consumidor pase claves excluidas, `AsyncAutocomplete` NO DEBE ofrecer esas
opciones, salvo la de la elección vigente. La exclusión NO DEBE depender del texto escrito ni
provocar ninguna consulta.

**R10.** DONDE el consumidor pase una clave de reinicio, CUANDO esa clave cambie, `AsyncAutocomplete`
DEBE descartar lo acumulado y volver a pedir la página 1. SI no se pasa, ENTONCES NO DEBE reiniciar
por ningún cambio de props: es lo que pasa hoy en `ProductPicker` con `productType` y en
`PackagingSelect` y `PresentationSelect` con `unitIds`.

**R11.** SI la consulta de una página falla, ENTONCES `AsyncAutocomplete` DEBE pintar el error en la
forma que pida el consumidor:
- el texto fijo de hoy, que es el defecto;
- el mensaje del servidor;
- o lo que pinte el propio consumidor, como el `ErrorAlert` de `PackagingSelect`.

El canal de error del hook NO DEBE cambiar de tipo, y ningún buscador DEBE mostrar una referencia de
error que hoy no muestra (QC-71 R17, P4).

**R12.** DONDE el consumidor controle el texto del campo, `AsyncAutocomplete` DEBE buscar con el
término que el consumidor indique, y no con el texto que se muestra. Abrir un buscador con una elección
hecha DEBE ofrecer la lista sin filtrar, como hoy.

**R13.** DONDE el consumidor marque una opción como no elegible, `AsyncAutocomplete` DEBE pintarla
deshabilitada. CUANDO se pulse, NO DEBE elegirla ni cerrar el desplegable.

**R14.** CUANDO se elige una opción elegible, `AsyncAutocomplete` DEBE cerrar el desplegable y avisar
al consumidor **antes** de que el primitivo notifique el nuevo texto del campo. Así `RecipePicker` no
retira la elección que se acaba de hacer.

**R15.** MIENTRAS el desplegable esté cerrado, o el consumidor desactive la consulta (campo
deshabilitado, o `PackagingSelect` sin permiso), `AsyncAutocomplete` NO DEBE consultar al servidor.

**R16.** `AsyncAutocomplete` DEBE aceptar por props los `data-testid`, las clases, los textos, el
alto máximo, el umbral de scroll, el rebote y el tamaño de página de cada sitio. SI no se le pasan,
ENTONCES DEBE usar los valores de hoy, de modo que `OrderCustomerPicker` no cambia.

**R17.** `AsyncAutocomplete` DEBE ofrecer, como opción, las dos presentaciones que conviven hoy:
- **la suya:** icono de búsqueda, botón de borrar y una sola región de estado con la carga, el error
  y el vacío;
- **la de los cinco:** sin icono y con borrar opcional. El vacío y el error son párrafos propios,
  el error sustituye a la lista, y la carga va en su propia región de estado.

SI no se elige, ENTONCES DEBE pintar la suya, tal cual. Unificarlas es QC-227 (D2).

### Los buscadores

**R18.** Cada uno de los cinco buscadores DEBE conservar en su propio archivo:
- su consulta: la Server Action, los parámetros, el mapeo a opciones y la conversión del rechazo en
  error;
- su regla de elección: cuándo se retira y qué se avisa;
- sus piezas de campo: etiqueta, input oculto o espejo, error del campo, ayuda, aviso de permiso y
  alta en línea.

Ninguna de esas piezas DEBE pasar a `AsyncAutocomplete` ni a una pieza nueva de campo (D4).

**R19.** La búsqueda DEBE seguir resolviéndola el servidor: ni `AsyncAutocomplete` ni los buscadores
DEBEN recortar opciones por el texto escrito (QC-26 R28, QC-35 R31).

### Guardia y alcance

**R20.** Una guardia DEBE fallar cuando un archivo de producción de `app/`, `components/` o `hooks/`
incumpla R7. Sus excepciones DEBEN ser una lista explicita de archivos, cada uno con su motivo, sin
patrones amplios. Cada regla DEBE tener una muestra que muerde.

**R21.** El diff de la rama NO DEBE tocar:
- los archivos de QC-223;
- `app/(private)/pedidos/components/order-customer-picker.tsx`;
- ningún barrel de ruta;
- `app/(public)/**`, que es donde trabaja QC-96;
- las piezas de campo, formularios, borrados y acciones por fila que no estén en
  `tasks.md > Archivos esperados` (D4).

**R22.** El diff NO DEBE añadir ninguna dependencia a `package.json` (D5).

**R23.** *(Pendiente de P3.)* La enmienda de `specs/QC-35-pantalla-de-pedidos/design.md > 9.1`, que
dice «No se promueve `ProductPicker` a `components/shared/`», DEBE quedar escrita con fecha en ese
archivo.

## Preguntas abiertas

**P1. Choque con QC-223: no he podido leer su rama.**
- **Qué pasa:** no hay `specs/QC-223-…` en `dev`, y este agente no tiene shell para leer
  `origin/feature/QC-223-entregar-producto-terminado`.
- **Por qué importa:** la ficha dice que en el panel de entrega «se elige el cliente», así que es
  probable que consuma `OrderCustomerPicker` o `AsyncAutocomplete`, y quizá cree un buscador de lotes.
- **Qué se pide:** antes de aprobar, el leader corre `node scripts/archivos-en-vuelo.mjs` y
  `git diff --name-only origin/dev...origin/feature/QC-223-entregar-producto-terminado`.
- **Si QC-223 toca `components/shared/async-autocomplete.tsx` o algún buscador de la lista**, ¿qué
  prefiere el humano?
  - (a) esperar a que QC-223 se mergee;
  - (b) sacar de QC-233 el buscador afectado.

  `AsyncAutocomplete` no se puede sacar: es el núcleo de la ficha.

**P2.** SI QC-223 se mergea antes con un buscador nuevo sobre los primitivos, ¿QC-233 lo adopta, o
queda como excepción con nombre en la guardia (R20) para otra ficha?

**P3.** ¿Se enmienda `specs/QC-35-pantalla-de-pedidos/design.md > 9.1` («No se promueve
`ProductPicker`… Se comparte el patrón, no el archivo») con una línea fechada que remita a QC-233?
Propuesta: sí, como hizo QC-231 con QC-56 (R23).

**P4.** ¿Se confirma que «añadir `error` como prop», como dice la auditoría, significa solo la
**forma de pintarlo** (R11)? Es decir:
- el canal sigue siendo `Error` / `string`;
- nadie gana la referencia del inesperado;
- QC-71 R17 (Opción B) sigue igual, y `guard-identificador-de-request` no se toca.

Llevar el `ErrorState` entero sería un cambio de comportamiento, fuera de D2.

**P5.** ¿Se confirma que «buscadores» son solo los seis autocompletados asíncronos? Quedarían fuera
las barras de búsqueda de las listas (`DataTable`, vitrina de proveedores), que no tienen dueño en
ninguna de las tres fichas, y los selects no asíncronos, que se asignan a QC-232.
