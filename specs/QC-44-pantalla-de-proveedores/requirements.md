# QC-44 — pantalla-de-proveedores · requirements.md

> **Zona** `frontend` · **Complejidad** `high` · **depends_on** `QC-43`, `QC-52` · **Rama** `feature/QC-44-pantalla-de-proveedores`
>
> **Alcance.** La pantalla de proveedores en `/proveedores`, dentro del layout privado y **solo
> para el Administrador**, en dos niveles: la **lista paginada** de proveedores, con alta y edición
> en panel lateral y baja con confirmación; y la **página de detalle** `/proveedores/<id>` con sus
> datos de contacto y su **catálogo paginado**, donde se agregan, editan y dan de baja las líneas.
> Las operaciones ya existen —QC-43 las expone como nueve Server Actions y QC-52 las reforma—:
> aquí entra la capa visual y sus tres estados (vacío, cargando, error), la constante de ruta, el
> ítem de navegación y la regla ruta→rol. La línea se captura **en su forma post-QC-52**: nombre
> propio, presentación obligatoria, unidad opcional, costo, mínimo de compra y tiempo de entrega,
> **sin ninguna referencia a un producto del inventario**.
>
> **Lo que NO entra.** La **subida de imágenes** de la línea: la columna existe desde QC-52 pero
> no hay flujo que la llene, y esta ficha no lo inventa (ver `## Preguntas abiertas`). El
> **historial de precios**: hoy, al subir un costo, el anterior se pierde (heredado de QC-42 P2).
> **Búsqueda y orden configurable**: el backend solo acepta `page` y `pageSize`, y filtrar en
> cliente solo buscaría dentro de la página visible; si se quieren, es ficha de backend nueva
> (mismo criterio que QC-22). **Los nombres de quien creó o modificó**. **Crear unidades** desde el
> selector: eso es QC-38 y su pantalla QC-39. El catálogo de presentaciones —listar, editar,
> borrar— sigue siendo **QC-45**. Y **nada de backend**: esta ficha no abre `lib/modules/` salvo
> para consumir contratos públicos y Server Actions ya existentes.
>
> Sembrado por `/afinar-feature` el 2026-09-04. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de proveedores**: la página de lista que esta ficha crea, servida
> en la URL que declara la constante de ruta de proveedores. **Página de detalle**: la página del
> proveedor concreto, servida en la ruta derivada de esa misma constante. **Layout privado**: el
> armazón de QC-11 (sidebar + cabecera + `<main>`) que envuelve todo `app/(private)/`; se hereda
> montado. **Panel lateral**: el `sheet` donde ocurren el alta y la edición. **Línea de catálogo**:
> la fila del catálogo de un proveedor en su forma post-QC-52 —nombre propio, presentación
> obligatoria, unidad opcional, costo, mínimo de compra, tiempo de entrega y ruta de imagen—, **sin
> ninguna referencia a un artículo del inventario**. **Los siete campos de negocio de la línea**:
> los que declara `CatalogLineFields`. **Operaciones de proveedores**: las nueve Server Actions que
> QC-43 expone y QC-52 reforma (`listSuppliersAction`, `getSupplierAction`, `createSupplierAction`,
> `updateSupplierAction`, `deleteSupplierAction`, `listCatalogLinesAction`,
> `createCatalogLineAction`, `updateCatalogLineAction`, `deleteCatalogLineAction`). **Las dos listas
> paginadas**: la de proveedores y la del catálogo de un proveedor.

### Ruta, navegación y protección

**R1** — El sistema DEBE exponer la pantalla de proveedores en la URL que declara la constante de
ruta de proveedores, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por el
layout privado existente** y sin declarar ningún armazón propio (no DEBE declarar un landmark
principal propio).

**R2** — La URL de la pantalla DEBE estar declarada en **una sola** constante exportada del módulo
de rutas compartidas —no en el módulo de navegación—, y todo consumidor —el ítem de navegación, la
lista de prefijos privados, la regla ruta→rol y cualquier destino de navegación de las dos
pantallas— DEBE derivarse de esa misma constante. Ningún archivo de producto DEBE incrustar esa URL
como literal.

**R3** — El sistema DEBE exponer la ruta de la página de detalle mediante un **helper exportado que
la derive** de la constante de R2 a partir del identificador del proveedor. Todo enlace o
navegación hacia el detalle DEBE construirse con ese helper, y ningún archivo de producto DEBE
incrustar la URL de detalle como literal.

**R4** — La navegación privada DEBE incluir un ítem **de nivel superior** en la sección «Cadena»
cuyo destino sea la constante de R2.

**R5** — La URL de la pantalla de proveedores DEBE quedar cubierta por la lista declarada de
prefijos de ruta privada, de modo que tanto la lista como la página de detalle exijan sesión válida
y una petición sin ella sea redirigida al login antes de renderizarlas.

**R6** — El sistema DEBE declarar una regla ruta→rol que restrinja el prefijo de proveedores al rol
Administrador. MIENTRAS la sesión tenga un rol distinto de Administrador, el sistema DEBE
redirigirla fuera de la lista y del detalle sin renderizar su contenido; MIENTRAS la sesión tenga el
rol Administrador, DEBE permitir el acceso a ambas.

**R7** — Ninguna de las dos pantallas DEBE tomar decisiones de autorización sobre los datos ni
repetir las que ya toman las operaciones de proveedores: toda lectura y toda escritura DEBEN pasar
por esas operaciones. SI una operación responde con un error de autorización, ENTONCES el sistema
DEBE presentar ese error y NO DEBE mostrar ningún dato de proveedores ni de catálogo.

### Las dos listas paginadas (reglas comunes)

**R8** — Cada una de las dos listas paginadas DEBE ofrecer un selector de tamaño de página con
exactamente dos opciones, 10 y 25, y DEBE usar 10 cuando no se indique ninguno. CUANDO el usuario
cambie el tamaño de página, el sistema DEBE recargar esa lista con el nuevo tamaño.

**R9** — CUANDO existan más elementos de los que caben en una página, cada lista paginada DEBE
permitir avanzar y retroceder de página e indicar la página actual y el total de páginas.

**R10** — SI los parámetros de paginación recibidos por cualquiera de las dos listas son inválidos,
están fuera de rango o exceden el tope soportado, ENTONCES el sistema DEBE acotarlos a valores
válidos y presentar la lista, y NO DEBE fallar ni mostrar un error.

**R11** — Ninguna de las dos listas DEBE ofrecer búsqueda ni control de ordenación configurable.

> **ENMIENDA DEL 2026-09-07 (decisión humana), y solo para la lista del CATÁLOGO.** Esa lista
> monta la **tabla compartida** (`components/shared/data-table`, la misma de inventario, pedidos y
> recetas) en lugar de su tabla y su barra de paginación propias —`catalog-list-toolbar.tsx`
> **desaparece**—. Con ella:
>
> - **R11 se invierte para el catálogo**: sí ofrece búsqueda y orden por columna, más filtros de
>   rango para costo y tiempo de entrega. La razón es que el backend los soporta —
>   `SUPPLIER_CATALOG_LINE_QUERYABLE` declara `searchable: true`, cinco campos ordenables y cuatro
>   filtrables desde QC-57—. Lo que R11 protegía de verdad **sigue en pie y afirmado**: nada se
>   busca, ordena ni filtra en el cliente; cada gesto **navega** y la lista se vuelve a pedir sobre
>   el conjunto entero. `updatedAt` se muestra pero **no** ordena: no está en la lista blanca.
> - **La lista de PROVEEDORES no cambia**: sigue sin búsqueda ni orden, con su tabla y su barra.
> - **R8 y R9 no cambian de contenido, sí de dueño** para el catálogo: el selector de tamaño (10 y
>   25, con 10 por defecto) y la paginación los pinta la tabla compartida, con sus `data-testid`
>   (`data-table-page-size`, `data-table-previous`, `data-table-next`,
>   `data-table-page-indicator`).
> - **R10 se amplía**: los parámetros acotados pasan de `{ page, pageSize }` al contrato de lista
>   completo, y siguen sin poder producir un error.
> - El módulo `proveedores` **publica su lista blanca** (`SUPPLIER_CATALOG_LINE_QUERYABLE`) por su
>   barrel, como ya hacía `pedidos` con la suya: la pantalla comprueba contra el contrato en vez de
>   contra una copia escrita a mano.

> **ENMIENDA DEL 2026-09-15 (QC-56, decisión humana), para la lista de PROVEEDORES.** **Reabre la
> línea 106** de la enmienda anterior («La lista de PROVEEDORES no cambia»), que se deja escrita
> tal cual pero deja de valer: la lista de proveedores **también monta la tabla compartida**, en
> lugar de su tabla y su barra de paginación propias. La enmienda anterior daba además por hecho
> que recetas ya usaba esa tabla (l.96); medido en disco el 2026-09-15, **era falso**, y QC-56
> migra las dos. Con ella:
>
> - **R11 se INVIERTE también para la lista de proveedores**: ofrece orden por cabecera sobre
>   `name`, `createdAt` y `updatedAt`, búsqueda y filtro por rango de `createdAt`, exactamente lo
>   que declara `SUPPLIER_QUERYABLE` (QC-57). Teléfono, correo electrónico y acciones no ordenan.
>   Para el catálogo no cambia nada respecto a la enmienda anterior.
> - **Lo que R11 protegía sigue en pie y afirmado**: nada se ordena, filtra, busca ni recorta en el
>   navegador sobre la página ya descargada; cada gesto **navega** y la lista se vuelve a pedir al
>   servidor, que la recalcula.
> - **Cambia de dueño** para la lista de proveedores: el orden es **QC-56 R6** (y R7 para las
>   columnas que no ordenan), la búsqueda **QC-56 R8**, el filtro de fecha **QC-56 R9**, y la
>   protección de no calcular en el navegador **QC-56 R10**. R8 y R9 se conservan en QC-56 R22 y
>   R23, y R10 se amplía al contrato de lista completo en QC-56 R13.
> - El módulo `proveedores` **publica `SUPPLIER_QUERYABLE`** por su barrel, sin cambiar su
>   contenido, y la lista la consume desde ahí (QC-56 R31).

**R12** — Ninguna de las dos listas DEBE mostrar el identificador ni el nombre de quien creó o
modificó un proveedor o una línea de catálogo.

**R13** — MIENTRAS el ancho disponible no alcance para todas las columnas, cada lista DEBE resolver
el desbordamiento con **scroll horizontal contenido en la propia tabla**, sin provocar scroll
horizontal del documento, y los controles de acción de cada fila DEBEN seguir siendo alcanzables.

### Lista de proveedores

**R14** — La pantalla de proveedores DEBE presentar los proveedores obtenidos con la operación de
listado en una tabla paginada con sus columnas de negocio: nombre, teléfono, correo electrónico,
fecha de creación y fecha de actualización.

**R15** — Cada fila de la lista DEBE ofrecer una navegación a la página de detalle de ese proveedor,
construida según R3.

**R16** — MIENTRAS no exista ningún proveedor, el sistema DEBE presentar un estado vacío
identificable **propio de la lista de proveedores**, que ofrezca la acción de crear el primer
proveedor, en lugar de una tabla sin filas.

**R17** — MIENTRAS la lista de proveedores se está obteniendo, el sistema DEBE presentar un
indicador de carga identificable en lugar de la tabla.

**R18** — SI la operación de listado de proveedores responde con error, ENTONCES el sistema DEBE
presentar un estado de error identificable con el mensaje devuelto y una acción para reintentar, y
NO DEBE presentar una tabla vacía como si no hubiera proveedores.

### Página de detalle y catálogo del proveedor

**R19** — La página de detalle DEBE presentar los datos de contacto del proveedor obtenidos con la
operación de consulta —nombre, teléfono y correo electrónico— y, debajo, su catálogo paginado
obtenido con la operación de listado de líneas de ese proveedor.

**R20** — SI la operación de consulta del proveedor responde con «no encontrado», ENTONCES la
página de detalle DEBE presentar un estado identificable de proveedor inexistente con una
navegación de vuelta a la lista, y NO DEBE presentar el catálogo.

**R21** — La tabla del catálogo DEBE presentar, por cada línea, sus campos de negocio: nombre,
presentación, unidad, costo, mínimo de compra, tiempo de entrega, fecha de creación y fecha de
actualización.

**R22** — El sistema DEBE presentar la presentación y la unidad de cada línea por su **nombre**, no
por su identificador. SI el nombre de la presentación o el de la unidad no puede resolverse,
ENTONCES el sistema DEBE presentar un marcador identificable en esa celda y NO DEBE presentar el
identificador técnico.

**R23** — MIENTRAS el proveedor no tenga ninguna línea de catálogo, el sistema DEBE presentar un
estado vacío identificable **distinto del de la lista de proveedores**, que ofrezca la acción de
añadir la primera línea, en lugar de una tabla sin filas.

**R24** — MIENTRAS el catálogo del proveedor se está obteniendo, el sistema DEBE presentar un
indicador de carga identificable en lugar de la tabla del catálogo.

**R25** — SI la operación de listado del catálogo responde con error, ENTONCES el sistema DEBE
presentar un estado de error identificable con el mensaje devuelto y una acción para reintentar, y
NO DEBE presentar una tabla vacía como si el catálogo estuviera vacío.

### Alta y edición (proveedor y línea)

**R26** — CUANDO el usuario active la acción de crear o de editar un proveedor, o la de crear o
editar una línea de catálogo, el sistema DEBE abrir el formulario correspondiente en un **panel
lateral** sobre la pantalla actual, NO DEBE navegar a otra URL de pantalla completa y NO DEBE usar
un diálogo modal centrado. CUANDO el panel se cierre —por guardado o por cancelación—, el sistema
DEBE devolver al usuario a la lista de la que salió **en la misma página y con el mismo tamaño de
página** que tenía antes de abrirlo.

**R27** — El formulario de alta de proveedor DEBE permitir capturar nombre, teléfono y correo
electrónico, y enviarlos mediante la operación de alta de proveedor.

**R28** — CUANDO el usuario abra el formulario de edición de un proveedor, el sistema DEBE
precargarlo con los valores actuales de ese proveedor y enviar el **reemplazo completo** de sus
campos mediante la operación de edición de proveedor.

**R29** — El formulario de la línea de catálogo DEBE permitir capturar **los seis campos de negocio
que esta pantalla captura** —nombre, presentación, unidad, costo, mínimo de compra y tiempo de
entrega— con la presentación **obligatoria** y la unidad **opcional**, y NO DEBE ofrecer ningún
selector, campo ni referencia a un artículo del inventario. El séptimo campo de negocio del
contrato de la línea, la **ruta de imagen**, queda fuera del formulario por decisión y lo gobierna
R30: la pantalla la ignora.

**R30** — El formulario de la línea NO DEBE pedir ninguna imagen ni ofrecer subirla, y la tabla del
catálogo NO DEBE mostrar la imagen de la línea.

> **ENMIENDA DEL 2026-09-07 (decisión humana).** La segunda mitad de R30 se INVIERTE: la tabla del
> catálogo **SÍ muestra la imagen de la línea**, en su **primera columna**, con la miniatura
> compartida `components/shared/entity-image.tsx`. La primera mitad **no cambia**: el formulario
> sigue sin pedir imagen y sin ofrecer subirla, así que `supplier_catalog_lines.image_path` sigue
> sin ser llenada por nadie y lo que se ve hoy en todas las filas es el **marcador**
> (`public/inv_not_found.png`), que cubre los dos casos: ruta ausente y ruta que no resuelve.
>
> Sigue siendo cierto que la imagen **no es una columna de datos**: `CATALOG_COLUMNS` es una lista
> de celdas de texto y `imagePath` no está en ella; la declara la tabla, igual que la columna de
> acciones. Y sigue sin haber composición de URL pública: `proveedores` no tiene puerto de
> almacenamiento y esta enmienda no le añade uno.

**R31** — CUANDO el usuario abra el formulario de edición de una línea, el sistema DEBE precargarlo
con los valores actuales de esa línea y enviar el **reemplazo completo** de sus siete campos de
negocio mediante la operación de edición de línea; NO DEBE ofrecer cambiar el proveedor al que
pertenece la línea.

**R32** — SI un guardado se rechaza por validación o por cualquier otro error de la operación,
ENTONCES el sistema DEBE presentar el error **en línea dentro del formulario** —junto al campo
cuando el error identifique uno, y en una región de error del formulario cuando no—, decidiendo
**por el código estable** del error y nunca por su texto, y NO DEBE cerrar el panel ni perder lo
escrito.

**R33** — CUANDO una operación de alta, edición o baja termine con éxito, el sistema DEBE cerrar el
panel o el diálogo abierto, notificar el éxito mediante un aviso emergente (toast) y actualizar la
lista afectada para que refleje el cambio sin que el usuario tenga que recargar la pantalla.

**R34** — El sistema DEBE emitir sus avisos emergentes sobre la región de avisos que el layout
privado **ya monta**, y NO DEBE montar una segunda región de avisos.

### Baja

**R35** — CUANDO el usuario active la baja de un proveedor, el sistema DEBE pedir confirmación en un
diálogo que **nombre al proveedor**, advierta de que **sus líneas de catálogo se dan de baja con
él** y advierta de que la acción no se puede deshacer. MIENTRAS el usuario no confirme, el sistema
NO DEBE invocar la operación de baja; CUANDO confirme, DEBE invocarla y aplicar R33.

**R36** — CUANDO el usuario active la baja de una línea de catálogo, el sistema DEBE pedir
confirmación en un diálogo que **nombre la línea** y advierta de que la acción no se puede deshacer.
MIENTRAS el usuario no confirme, el sistema NO DEBE invocar la operación de baja; CUANDO confirme,
DEBE invocarla y aplicar R33.

### Selectores de la línea

**R37** — El formulario de la línea DEBE exigir una presentación y DEBE permitir alcanzar cualquier
presentación existente desde su selector, aunque haya más de las que caben en una consulta.

**R38** — CUANDO no exista la presentación que el usuario necesita, el sistema DEBE permitir crearla
desde el propio formulario mediante la operación de alta de presentación, y CUANDO esa creación
termine con éxito, DEBE dejarla seleccionada sin perder lo ya escrito en el formulario.

**R39** — El sistema NO DEBE ofrecer listar, editar ni borrar presentaciones; la única operación de
presentación disponible es su alta desde el selector (R38).

**R40** — El selector de unidad DEBE ofrecer únicamente las unidades existentes obtenidas con la
operación de listado de unidades, DEBE permitir dejar la línea **sin unidad**, y NO DEBE permitir
crear una unidad ni aceptar texto libre.

### Importes

**R41** — El sistema DEBE presentar y enviar el costo y el mínimo de compra **tal como los entrega y
los espera el contrato** (cadena decimal), y NO DEBE convertirlos a coma flotante, ni operar
aritméticamente con ellos, ni capturarlos con un control numérico del navegador.

### Estructura, convenciones y plataforma

**R42** — Los componentes propios de cada una de las dos rutas DEBEN vivir en la carpeta
`components/` de su ruta y exponerse por su barrel `index.ts`; las páginas NO DEBEN importarlos por
ruta profunda ni dejarlos sueltos junto a `page.tsx`, y las páginas DEBEN vivir bajo el route group
privado.

**R43** — Toda lectura y toda mutación DEBEN realizarse mediante las Server Actions ya publicadas
por los módulos correspondientes; el sistema NO DEBE llamar a rutas API propias con `fetch` ni
crear ninguna.

**R44** — Las primitivas de interfaz que las pantallas necesiten DEBEN provenir de la librería de
componentes por su CLI; el sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`.

**R45** — Los formularios DEBEN construirse con el patrón de formulario no controlado del repo
(`<form action>` + `useActionState`) y con los esquemas de validación que el contrato público de
proveedores ya exporta; el sistema NO DEBE añadir ninguna dependencia nueva a `package.json`.

**R46** — Los componentes de cliente de las dos pantallas DEBEN recibir por props los datos de
sesión y los datos de negocio que muestran; NO DEBEN importar el punto de composición, ni el cliente
de base de datos, ni obtener esos datos por su cuenta, salvo las invocaciones de Server Action que
R43 autoriza.

**R47** — Cada control interactivo y cada región de estado de las dos pantallas DEBE ser
identificable por su rol accesible o por un `data-testid` estable, de modo que se pueda localizar
sin depender del texto visible.

**R48** — Las dos pantallas DEBEN ser utilizables en viewport angosto y en viewport ancho: NO DEBEN
usar `100vh` como alto de pantalla, NO DEBEN depender de `:hover` como única vía para descubrir o
activar una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de formulario
DEBEN tener un tamaño de fuente de al menos 16 px.

**R49** — El sistema NO DEBE modificar `lib/modules/**`, `db/**` ni `lib/composition/index.ts`: los
módulos se consumen solo por su contrato público y por sus adaptadores driving ya existentes. Los
únicos archivos heredados que esta feature puede modificar son los que exigen R2 y R3 (constantes de
ruta), R4 (navegación privada), R5 (prefijos privados) y R6 (reglas ruta→rol), más la reubicación de
componente compartido que declara `design.md`.

**R50** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la navegación
privada, la región de avisos, las primitivas ya instaladas ni las utilidades de test: las hereda
montadas.

### Verificación de extremo a extremo

**R51** — El sistema DEBE cubrir con una prueba de extremo a extremo el camino completo del
Administrador: iniciar sesión, llegar a la pantalla de proveedores, dar de alta un proveedor, entrar
a su página de detalle, añadir una línea de catálogo y verla en la lista del catálogo.

**R52** — El sistema DEBE cubrir con una prueba de extremo a extremo el rechazo de una sesión válida
con rol distinto de Administrador que pide la URL de proveedores: DEBE acabar fuera de la pantalla y
sin ver ningún dato.

## Preguntas abiertas

**P1 — La línea tiene columna de imagen y nadie la llena.** Heredada de QC-52 (P1). La pantalla la
ignora por decisión de esta acotación, pero quién sube, dónde se guarda —el único flujo de subida
del repo es el de recetas, sobre Supabase Storage— y qué pasa al dar de baja una línea con imagen
sigue sin decidirse. No se rellena con un supuesto (regla 6 de `CLAUDE.md`).

**P2 — El mínimo de compra sigue sin decir en qué se mide.** Se lee según la unidad, que QC-32
dejó **opcional**: un mínimo de `2,5` sobre una línea sin unidad es ambiguo. Heredada de QC-42 (P4)
y de QC-52 (P3), y sigue abierta.

**P3 — CERRADA el 2026-09-04 por el merge de QC-52.** La pregunta decía que QC-52 todavía se estaba
implementando y que esta ficha se especificaba contra sus decisiones cerradas y no contra código
mergeado. **Ya no aplica**: QC-52 se mergeó en `dev` (PR #32, merge `855fae6`) y su código está en
el worktree de esta feature. Este spec se escribió **contra el código real y verificado**: la
migración `db/migrations/20260904123854_split_product_and_supplier_catalog/`, el contrato público
`lib/modules/proveedores/index.ts`, `domain/catalog-line-view.ts` (los siete campos de negocio, sin
`product_id`), `domain/catalog-line-input.ts`, `domain/errors.ts` y los dos adaptadores driving
(`supplier-actions.ts`, `supplier-catalog-actions.ts`). La condición «si alguna decisión de QC-52
cambia, para y reporta» queda sin objeto porque ya no hay implementación pendiente; lo que sigue
vigente es lo de siempre: si el código no coincide con lo que `design.md` describe, el
`frontend_dev` **para y lo reporta al leader**.

**P4 — Cómo se resuelve el nombre de la presentación de una línea (nueva, abierta).**
`CatalogLineView` entrega `presentationId` y `unitId` **en crudo** —QC-52 lo dejó escrito y lo
reenvió a esta ficha—. Las unidades tienen una operación de listado completo (`listUnitsAction`,
acotada a 200 por QC-26), pero las presentaciones **solo** tienen `listPresentationsAction`
paginada, con tope de 25 por página y sin operación de «listar todas» ni de «resolver estos ids».
`design.md > 6.2` elige la única solución que no abre backend —recorrer páginas hasta una cota
declarada y pintar un marcador cuando el nombre no se resuelva (R22)—, pero **si un catálogo de
presentaciones grande hiciera esa resolución impracticable, la solución real es una operación de
lectura nueva en `inventario` (por ids o sin paginar), y eso es ficha de backend**, no un añadido
aquí. No se rellena con un supuesto (regla 6 de `CLAUDE.md`): queda anotada para que el humano
decida si la abre.

Si durante la implementación aparece cualquier otra ambigüedad, el `frontend_dev` **para y la
reporta al leader**; no la rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-04 | ¿Contra qué forma de la línea se especifica? | **Contra la forma post-QC-52**: nombre propio, presentación obligatoria, unidad opcional, costo, mínimo de compra y tiempo de entrega, **sin `product_id`**. No hay selector de producto del inventario. Se añadió el link *is blocked by* QC-52 en el board: el spec se escribe ya, la implementación espera |
| 2026-09-04 | ¿Una pantalla o dos? | **Lista + página de detalle.** `/proveedores` lista paginada; `/proveedores/<id>` con los datos del proveedor y su catálogo paginado. Es la única forma que da sitio a la lista paginada que QC-43 expone por separado (`listCatalogLinesAction`), y sigue el patrón de la pantalla de recetas (QC-26) |
| 2026-09-04 | URL y ubicación en el menú | **`SUPPLIERS_ROUTE = '/proveedores'`**, declarada en `lib/shared/routes.ts` —no en `private-nav.ts`— porque el middleware y la regla ruta→rol la necesitan y no pueden depender de la navegación. Ítem de nivel superior en la sección **«Cadena»**, junto a Producción. Proveedores es módulo de dominio propio: la épica QC-41 se creó expresamente fuera de Catálogos y de Inventario |
| 2026-09-04 | La ruta de detalle | **Derivada de la constante**, con un helper del mismo patrón que `recipeEditRoute(id)` de QC-26. Ningún archivo incrusta la URL como literal (QC-11 R13) |
| 2026-09-04 | ¿Se muestra quién creó o modificó? | **NO.** `SupplierView` y `CatalogLineView` traen ids, no nombres, y resolverlos exige consumir el contrato público de `identity` — trabajo nuevo que la ficha del board no pide. **Cierra el reenvío** que QC-43 dejó escrito en `supplier-view.ts` («eso es QC-44»). Mismo criterio que QC-22 |
| 2026-09-04 | La columna de imagen de la línea | **La pantalla la ignora**: ni el formulario la pide ni la tabla la muestra. Mismo trato que hoy da la pantalla de productos a la misma columna. Ver P1 |
| 2026-09-04 | ¿E2E? | **SÍ, el camino completo**: login → `/proveedores` → alta de proveedor → detalle → añadir una línea → verla en la lista, más el rechazo de un no-Administrador. **Cierra el diferimiento de QC-52**, que declaró expresamente que el E2E del catálogo de proveedores «es QC-44». `CHECKPOINTS.md` lo pide para permisos e importes y esta pantalla toca los dos |
| 2026-09-04 | Dar de baja un proveedor | **Diálogo de confirmación que nombra al proveedor y avisa del arrastre**: sus líneas de catálogo se dan de baja con él (QC-52). En base es borrado lógico, pero el backend no expone forma de restaurar: para el usuario es irreversible y se presenta como tal (QC-22) |
| 2026-09-04 | Selector de presentación | **Permite crear una presentación sin salir del formulario**, con `createPresentationAction` que QC-20 ya expone. La presentación es obligatoria en la línea (QC-52) y su pantalla propia (QC-45) todavía no existe: sin esto, una tabla `presentations` vacía dejaría el alta muerta. Heredado tal cual de QC-22 |
| 2026-09-04 | Selector de unidad | **Solo elige de las existentes**, con `listUnitsAction`, que el módulo `unidades` ya expone. **No permite crear**: la unidad es opcional y no bloquea nada, y el alta de unidades es el alcance de QC-38, con su pantalla en QC-39 |
| 2026-09-04 | ¿Búsqueda y orden configurable? | **NO.** `pageQuerySchema` de QC-43 solo acepta `page` y `pageSize`; filtrar en cliente solo buscaría dentro de la página visible. Si se quieren, es ficha de backend nueva. Heredado de QC-22 |
| 2026-09-04 | Tamaño de página | **Selector de 10 y 25**, en las dos listas. Sin trabajo de backend: `toOffsetLimit` acota por encima en vez de rechazar. Heredado de QC-22 |
| 2026-09-04 | Alta y edición | **Panel lateral (`sheet` de shadcn/ui)**, tanto para el proveedor como para la línea. Ni modal centrado ni ruta aparte. Heredado de QC-22 |
| 2026-09-04 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo.** `<Toaster />` ya lo monta QC-22 en el layout privado: **no se vuelve a montar**. Heredado de QC-22 |
| 2026-09-04 | Protección de la ruta | **Entra en esta ficha.** La URL se añade a `PRIVATE_ROUTE_PREFIXES` —el guard `guard-rutas-privadas-cubiertas` pone el gate en rojo si no— y se declara su **regla ruta→rol restringida a Administrador**, segunda del repo tras la de QC-22 (QC-9) |
| 2026-09-04 | Autorización sobre los datos | **La pantalla no la aporta ni la repite.** Los nueve casos de uso de `proveedores` ya llaman a `requireAdmin` como primera línea (QC-43 R1–R5). Que una regla ruta→rol deje pasar no autoriza nada (QC-9 R29) |
| 2026-09-04 | Importes | **Cadena decimal, tal como los entrega la consulta.** No se convierten a coma flotante ni se opera aritméticamente con ellos. Heredado de QC-22 R8 y de QC-43 |
| 2026-09-04 | Desbordamiento de las tablas | **Scroll horizontal contenido en la propia tabla**, nunca del `body`, con las acciones de fila siempre alcanzables. Se comprueba en viewport angosto. Heredado de QC-22 |
| 2026-09-04 | Estados de la pantalla | **Vacío, cargando y error**, en las dos listas. El vacío de la lista de proveedores y el del catálogo de un proveedor son distintos y ambos se declaran |
| 2026-09-04 | Mutaciones | **Server Actions**, las nueve que ya expone QC-43. Prohibido `fetch` a API routes propias. Heredado de QC-11 |
| 2026-09-04 | Librería de componentes | **shadcn/ui por CLI**; ningún primitivo se escribe ni se edita a mano. El formulario usa `<form action>` + `useActionState` + los esquemas zod del contrato público de `proveedores`: **no entra `react-hook-form`** (QC-22 P2, resuelta al aprobar su spec). Si hiciera falta una librería de verdad, el `frontend_dev` **para y la propone** (regla 7 de `CLAUDE.md`) |
| 2026-09-04 | Route group y componentes | **`app/(private)/`** (QC-11 D1) y componentes en `<ruta>/components/` con barrel `index.ts` (QC-12) |
| 2026-09-04 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (QC-11, `CHECKPOINTS.md > Permisos`) |
| 2026-09-04 | Rutas y asserts | Rutas siempre en constantes exportadas. Los tests afirman sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy. Heredado de QC-11 y QC-22 |
| 2026-09-04 | Multiplataforma | Se valida contra angosto y ancho con `tests/helpers/viewport.ts`. **Sin excepción de escritorio.** Heredado de QC-11 |
| 2026-09-04 | Base heredada | shadcn/ui, Vitest, Playwright, layout privado, sidebar y `<Toaster />` **están montados y no se re-crean**. El choque entre las features 4 y 10 ya ocurrió una vez en este repo |
