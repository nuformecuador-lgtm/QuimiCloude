# QC-35 — pantalla-de-pedidos · requirements.md

> **Zona** `frontend` · **Complejidad** `high` · **depends_on** `QC-34` · **Rama** `feature/QC-35-pantalla-de-pedidos`
>
> **Alcance.** La pantalla de pedidos dentro del layout privado y **solo para el Administrador**:
> la **lista paginada** —con estado, prioridad, nombre de receta y nombre de unidad—, el **alta y
> la edición en panel lateral**, la **cancelación con motivo obligatorio** y el **borrado**. Las
> operaciones ya existen: QC-34 las expone como cinco Server Actions y QC-57 les dio orden, filtro
> y búsqueda. Aquí entra la capa visual y sus tres estados (vacío, cargando, error), la constante
> de ruta, el ítem de navegación y la regla ruta→rol. **Esta pantalla es el primer consumidor de la
> tabla de datos compartida de QC-55**, que lleva mergeada sin estrenar desde el 2026-09-04.
>
> **Lo que NO entra.** La **búsqueda de la lista** y la **columna de total**, que son trabajo de
> backend y viven en **QC-68**. Esta ficha **no espera a QC-68** —decisión humana del 2026-09-06—:
> la pantalla nace **sin caja de búsqueda y sin columna de total**, en vez de nacer con una caja y
> una columna que no hacen nada. Enchufar las dos cuando QC-68 esté `done` es una ficha de frontend
> posterior, que hoy no existe y que **no se crea aquí**. El **cambio de estado desde la lista**:
> el estado se edita en el formulario y en ningún otro sitio. La **migración de las pantallas de
> productos y de recetas** a la tabla compartida, que es **QC-56**, y con ella la comprobación en
> Safari de iOS real que QC-56 tiene marcada como bloqueante. El **flujo de devolución** de un
> pedido entregado, que no existe en el sistema (pregunta abierta 1 de QC-34). Los **nombres de
> quien creó o modificó**. Y **nada de backend**: esta ficha no abre `lib/modules/` salvo para
> consumir contratos públicos y Server Actions ya existentes.
>
> Sembrado por `/afinar-feature` el 2026-09-06. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de pedidos**: la única página que esta ficha crea, servida en la
> URL que declara la constante de ruta de pedidos; no hay página de detalle. **Layout privado**: el
> armazón de QC-11 (sidebar + cabecera + `<main>`) que envuelve todo `app/(private)/`; se hereda
> montado. **Tabla de datos compartida**: el componente de QC-55 (`components/shared/data-table`) y
> su barrel, del que esta pantalla es el primer consumidor. **Panel lateral**: el `sheet` donde
> ocurren el alta y la edición. **Operaciones de pedidos**: las seis Server Actions que QC-34 expone
> en su adaptador driving (`listOrdersAction`, `getOrderAction`, `createOrderAction`,
> `updateOrderAction`, `cancelOrderAction`, `deleteOrderAction`). **Fila de pedido**: lo que la
> consulta de listado entrega por pedido (`OrderView`/`OrderSummary`), con el nombre de la receta y
> el de la unidad **ya resueltos** (desde el 2026-09-07, solo el de la receta). **Los campos de
> negocio del pedido**: receta, cantidad y prioridad —eran cinco hasta el 2026-09-07, con la unidad
> y el precio unitario—. **Correlativo**: el número visible del pedido, compuesto por
> la única función de formato que publica el contrato de `pedidos`. **Estado final**: `ENTREGADO` o
> `CANCELADO`. **Consulta de lista**: la forma genérica de QC-57 (página, tamaño, orden, filtros,
> búsqueda) que la operación de listado acepta. **Lista blanca de pedidos**: `ORDER_QUERYABLE`, que
> declara qué campos son ordenables y cuáles filtrables, y que `searchable` es falso. **Importe**:
> la cantidad y el precio unitario, que viajan como cadena decimal.

### Ruta, navegación y protección

**R1** — El sistema DEBE exponer la pantalla de pedidos en la URL que declara la constante de ruta
de pedidos, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por el layout
privado existente** y sin declarar ningún landmark principal propio. El sistema NO DEBE exponer
ninguna otra URL de pedidos: la lista, el alta, la edición, la cancelación y el borrado ocurren
todos en esa misma ruta.

**R2** — La URL de la pantalla DEBE estar declarada en **una sola** constante exportada del módulo
de rutas compartidas —no en el módulo de navegación—, y todo consumidor —el ítem de navegación, la
lista de prefijos privados, la regla ruta→rol y cualquier destino de navegación de la pantalla—
DEBE derivarse de esa misma constante. Ningún archivo de producto DEBE incrustar esa URL como
literal.

**R3** — La navegación privada DEBE incluir un ítem **de nivel superior** en la sección «Operación»
cuyo destino sea la constante de R2.

**R4** — La URL de la pantalla DEBE quedar cubierta por la lista declarada de prefijos de ruta
privada, de modo que exija sesión válida y una petición sin ella sea redirigida al login antes de
renderizarla.

**R5** — El sistema DEBE declarar una regla ruta→rol que restrinja el prefijo de pedidos al rol
Administrador. MIENTRAS la sesión tenga un rol distinto de Administrador, el sistema DEBE
redirigirla fuera de la pantalla sin renderizar su contenido; MIENTRAS la sesión tenga el rol
Administrador, DEBE permitir el acceso.

**R6** — La pantalla NO DEBE tomar decisiones de autorización sobre los datos ni repetir las que ya
toman las operaciones de pedidos: toda lectura y toda escritura DEBEN pasar por esas operaciones. SI
una operación responde con un error de autorización, ENTONCES el sistema DEBE presentar ese error y
NO DEBE mostrar ningún dato de pedidos.

### La lista de pedidos

**R7** — La pantalla DEBE presentar los pedidos obtenidos con la operación de listado usando la
**tabla de datos compartida**, importada por su barrel público, y NO DEBE declarar una tabla propia
ni copiar el esqueleto de tabla de ninguna otra pantalla.

**R8** — La tabla DEBE presentar, por cada fila de pedido, sus columnas de negocio: correlativo,
estado, prioridad, nombre de receta, cantidad, nombre de unidad, precio unitario, fecha de solicitud
y motivo de cancelación. La tabla NO DEBE presentar ninguna columna de total, ni el identificador o
el nombre de quien creó o modificó el pedido.

**R9** — El sistema DEBE presentar la receta y la unidad de cada fila por su **nombre**, tomándolo
de la propia fila de pedido, y NO DEBE consultar los catálogos de recetas ni de unidades para
resolverlos. SI el nombre de la receta o el de la unidad no viene informado, ENTONCES el sistema
DEBE presentar un marcador identificable en esa celda y NO DEBE presentar el identificador técnico.

**R10** — El sistema DEBE componer el correlativo visible con la función de formato que publica el
contrato público de pedidos, y NO DEBE construir ese texto por su cuenta en ningún archivo.

**R11** — MIENTRAS un pedido esté cancelado, la tabla DEBE presentar su motivo de cancelación;
MIENTRAS no lo esté, DEBE presentar en esa celda un marcador identificable de ausencia y NO DEBE
presentar un motivo.

**R12** — La tabla DEBE ofrecer ordenar desde la cabecera **únicamente** por correlativo, fecha de
solicitud, prioridad y estado, y NO DEBE ofrecer ordenación en ninguna otra columna. Las columnas
ordenables DEBEN ser exactamente las que la lista blanca de pedidos declara como tales.

**R13** — MIENTRAS el usuario no haya pedido ningún orden, el sistema DEBE presentar las filas
**en el orden en que la consulta las entrega**, y NO DEBE reordenarlas, filtrarlas ni recortarlas en
el cliente en ningún caso.

**R14** — La tabla DEBE ofrecer filtrar por estado y por prioridad como **selección de valores**
—tomados de los conjuntos cerrados que publica el contrato de pedidos— y por **rango de fechas** de
solicitud, y NO DEBE ofrecer ningún otro filtro.

**R15** — CUANDO el usuario cambie el orden, un filtro, la página o el tamaño de página, el sistema
DEBE pedir de nuevo la lista al servidor con la consulta completa resultante, de modo que el
resultado se calcule sobre el conjunto entero de pedidos y no sobre la página ya descargada.

**R16** — La lista DEBE ofrecer un selector de tamaño de página con exactamente dos opciones, 10 y
25, y DEBE usar 10 cuando no se indique ninguno.

**R17** — CUANDO existan más pedidos de los que caben en una página, la lista DEBE permitir avanzar
y retroceder de página e indicar la página actual y el total de páginas.

**R18** — SI los parámetros de lista recibidos por la pantalla son inválidos, están fuera de rango,
exceden el tope soportado o nombran un campo que la lista blanca no declara, ENTONCES el sistema
DEBE acotarlos o descartarlos y presentar la lista, y NO DEBE fallar ni mostrar un error.

**R19** — El sistema DEBE presentar la columna del correlativo **fijada** desde la primera carga, de
modo que permanezca visible al desplazar la tabla horizontalmente, sin que el usuario tenga que
fijarla.

**R20** — La pantalla NO DEBE presentar ninguna caja de búsqueda de la lista, NO DEBE enviar ningún
término de búsqueda en la consulta y NO DEBE filtrar por texto las filas ya descargadas.

**R21** — El sistema DEBE presentar tres estados mutuamente excluyentes de la lista: MIENTRAS la
lista se está obteniendo, un indicador de carga identificable; MIENTRAS no exista ningún pedido, un
estado vacío identificable que ofrezca la acción de crear el primer pedido; y SI la operación de
listado responde con error, un estado de error identificable con el mensaje devuelto. Un error NO
DEBE presentarse como lista vacía.

**R22** — MIENTRAS el ancho disponible no alcance para todas las columnas, la lista DEBE resolver el
desbordamiento con **scroll horizontal contenido en la propia tabla**, sin provocar scroll
horizontal del documento, y los controles de acción de cada fila DEBEN seguir siendo alcanzables.

### Acciones de fila

**R23** — Cada fila DEBE ofrecer, en una columna de acciones **siempre visible** —nunca descubierta
solo por `:hover`—, las acciones de editar, cancelar y borrar ese pedido, declaradas como parte de
la configuración de columnas de la tabla compartida.

**R24** — MIENTRAS un pedido esté en estado final, el sistema DEBE presentar sus tres acciones de
fila **deshabilitadas** y con un motivo visible de por qué no están disponibles, y NO DEBE invocar
ninguna operación de edición, cancelación ni borrado sobre ese pedido.

### Alta y edición

**R25** — CUANDO el usuario active la acción de crear o de editar un pedido, el sistema DEBE abrir
el formulario en un **panel lateral** sobre la pantalla actual, NO DEBE navegar a otra URL y NO DEBE
usar un diálogo modal centrado. CUANDO el panel se cierre —por guardado o por cancelación—, el
sistema DEBE devolver al usuario a la lista **con los mismos parámetros de lista** (página, tamaño,
orden y filtros) que tenía antes de abrirlo.

**R26** — El formulario de alta DEBE permitir capturar **los cinco campos de negocio del pedido** y
enviarlos mediante la operación de alta. El formulario de alta NO DEBE ofrecer estado, motivo de
cancelación, correlativo, fecha de solicitud ni autoría.

**R27** — El formulario DEBE presentar la prioridad como campo **opcional** con las cuatro
prioridades que publica el contrato de pedidos y con la prioridad por defecto **preseleccionada de
forma visible**, no implícita.

**R28** — CUANDO el usuario abra el formulario de edición de un pedido, el sistema DEBE precargarlo
con los valores actuales de ese pedido y enviar el **reemplazo completo** de sus campos de negocio
más su estado mediante la operación de edición.

**R29** — El estado del pedido DEBE poder cambiarse **únicamente** desde el formulario de edición, y
el sistema NO DEBE ofrecer ningún control de cambio de estado en la lista ni en ninguna otra parte
de la pantalla. El selector de estado DEBE ofrecer exactamente los estados que el contrato declara
editables y NO DEBE ofrecer el estado cancelado.

**R30** — El sistema NO DEBE ofrecer ningún campo de fecha de solicitud en ningún formulario: esa
fecha solo se presenta y se usa para ordenar (R8, R12).

**R31** — El selector de receta DEBE permitir buscar por nombre, y esa búsqueda DEBE resolverse
**en el servidor** mediante la operación de listado de recetas; el sistema NO DEBE filtrar por texto
la colección de recetas ya descargada. El selector DEBE permitir alcanzar cualquier receta
existente, aunque haya más de las que caben en una consulta.

**R32** — El selector de unidad DEBE ofrecer únicamente las unidades existentes obtenidas con la
operación de listado de unidades, y NO DEBE permitir crear una unidad ni aceptar texto libre.

**R33** — Los formularios DEBEN construirse con el patrón de formulario no controlado del repo
(`<form action>` + estado de acción) y validarse con **los mismos esquemas del contrato público de
pedidos** que valida la operación; el sistema NO DEBE escribir una segunda copia de esas reglas ni
añadir ninguna dependencia nueva a `package.json`.

**R34** — SI un guardado se rechaza por validación o por cualquier otro error de la operación,
ENTONCES el sistema DEBE presentar el error **en línea dentro del formulario** —junto al campo
cuando el error identifique uno, y en una región de error del formulario cuando no—, decidiendo
**por el código estable** del error y nunca por su texto, y NO DEBE cerrar el panel ni perder lo
escrito.

**R35** — CUANDO una operación de alta, edición, cancelación o borrado termine con éxito, el sistema
DEBE cerrar el panel o el diálogo abierto, notificar el éxito mediante un aviso emergente (toast) y
actualizar la lista para que refleje el cambio sin que el usuario tenga que recargar la pantalla.

**R36** — El sistema DEBE emitir sus avisos emergentes sobre la región de avisos que el layout
privado **ya monta**, y NO DEBE montar una segunda región de avisos.

### Cancelación y borrado

**R37** — CUANDO el usuario active la cancelación de un pedido, el sistema DEBE pedir el **motivo**
en un diálogo propio, distinto del formulario de edición y del diálogo de borrado. MIENTRAS el
motivo esté vacío, el sistema NO DEBE invocar la operación de cancelación; CUANDO el usuario
confirme con un motivo, DEBE invocar **la operación de cancelación** —y ninguna otra— y aplicar R35.

**R38** — CUANDO el usuario active el borrado de un pedido, el sistema DEBE pedir confirmación en un
diálogo que **nombre el pedido por su correlativo** y advierta de que la acción no se puede deshacer.
MIENTRAS el usuario no confirme, el sistema NO DEBE invocar la operación de borrado; CUANDO
confirme, DEBE invocarla y aplicar R35.

### Importes

**R39** — El sistema DEBE presentar y enviar la cantidad y el precio unitario **tal como los entrega
y los espera el contrato** (cadena decimal), y NO DEBE convertirlos a coma flotante, ni operar
aritméticamente con ellos —tampoco para obtener un total—, ni capturarlos con un control numérico
del navegador.

> **ENMIENDA DEL 2026-09-07 (decisión humana).** El pedido **YA NO TIENE unidad ni precio
> unitario**. Las columnas `orders.unit_id` y `orders.unit_price` se dropearon —con su FK
> `orders_unit_id_fkey`, el CHECK `orders_unit_price_non_negative` y los índices
> `orders_unit_id_idx` y `orders_unit_price_idx`— en
> `db/migrations/20260907120000_orders_drop_unit_and_unit_price`, y con ellas salieron del
> esquema Prisma, del dominio de `pedidos`, de su adaptador driven, del cableado y de la
> pantalla. Un pedido es hoy **receta + cantidad + prioridad + estado**, más su correlativo, sus
> autores y su borrado lógico.
>
> Los requisitos que hablan de la unidad o del precio unitario quedan **sin sujeto**; se conservan
> escritos para que se vea qué se decidió antes y qué lo sustituyó, no porque sigan vigentes. Sus
> tests se retiraron uno a uno, cada uno con la nota de por qué (búsquese «QC-35bis» en
> `tests/`). El `DROP COLUMN` **perdió los datos** de precio y unidad de los pedidos existentes:
> el `down.sql` recrea la forma, no el contenido.

### Estructura, convenciones y plataforma

**R40** — Los componentes propios de la ruta DEBEN vivir en la carpeta `components/` de esa ruta y
exponerse por su barrel `index.ts`; la página NO DEBE importarlos por ruta profunda ni dejarlos
sueltos junto a `page.tsx`, y DEBE vivir bajo el route group privado.

**R41** — Toda lectura y toda mutación DEBEN realizarse mediante las operaciones de pedidos, de
recetas y de unidades ya publicadas, **importando los adaptadores driving por su ruta exacta y
nunca por el barrel del módulo**; el sistema NO DEBE llamar a rutas API propias con `fetch` ni crear
ninguna.

**R42** — Las primitivas de interfaz que la pantalla necesite DEBEN provenir de la librería de
componentes por su CLI; el sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`,
y NO DEBE añadir ninguna dependencia a `package.json` sin la aprobación humana que exige el proceso.

**R43** — Los componentes de cliente de la pantalla DEBEN recibir por props los datos de sesión y
los datos de negocio que muestran; NO DEBEN importar el punto de composición, ni el cliente de base
de datos, ni obtener esos datos por su cuenta, salvo las invocaciones de Server Action que R41
autoriza.

**R44** — Cada control interactivo y cada región de estado de la pantalla DEBE ser identificable por
su rol accesible o por un `data-testid` estable, de modo que se pueda localizar sin depender del
texto visible.

**R45** — La pantalla DEBE ser utilizable en viewport angosto y en viewport ancho: NO DEBE usar
`100vh` como alto de pantalla, NO DEBE depender de `:hover` como única vía para descubrir o activar
una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de formulario DEBEN
tener un tamaño de fuente de al menos 16 px.

**R46** — El sistema NO DEBE modificar `lib/modules/**`, `db/**` ni `lib/composition/index.ts`: los
módulos se consumen solo por su contrato público y por sus adaptadores driving ya existentes. Los
únicos archivos heredados que esta feature puede modificar son los que exigen R2 (constante de
ruta), R3 (navegación privada), R4 (prefijos privados) y R5 (regla ruta→rol), más los cambios de la
tabla de datos compartida que `design.md` declara uno por uno.

**R47** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la navegación
privada, la región de avisos, la tabla de datos compartida, las primitivas ya instaladas ni las
utilidades de test: las hereda montadas.

### Verificación de extremo a extremo

**R48** — El sistema DEBE cubrir con una prueba de extremo a extremo el camino completo del
Administrador: iniciar sesión, llegar a la pantalla de pedidos, dar de alta un pedido, verlo en la
lista, cancelarlo con un motivo y ver ese motivo en la lista.

**R49** — El sistema DEBE cubrir con una prueba de extremo a extremo el rechazo de una sesión válida
con rol distinto de Administrador que pide la URL de pedidos: DEBE acabar fuera de la pantalla y sin
ver ningún dato.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`).

1. **¿Cómo se declara una columna de ACCIONES de fila en la tabla compartida?** Es la **pregunta
   abierta 4 de QC-55**, y QC-56 dejó escrito que «sin resolverlo, esta migración no se puede
   completar». Hoy la configuración de columnas devuelve texto, y esta pantalla necesita editar,
   cancelar y borrar por fila. **QC-35 la hereda por ser el primer consumidor** y no puede
   esquivarla. Lo que se resuelva aquí es lo que QC-56 va a adoptar después: si la solución exige
   tocar `components/shared/data-table/`, eso es cambio del componente de QC-55 y se dice en el PR.
2. **`DataTableColumn` no expone ancho de columna**, así que toda columna cae en los 150 px por
   defecto de la librería. Deuda anotada por QC-55. Esta pantalla tiene columnas angostas —estado,
   prioridad, número— y puede que no la sufra; si la sufre, se resuelve en el componente.
3. **`focusColumnFilter` no está acotado por `tableId`.** Deuda anotada por QC-55. Esta pantalla
   monta **una sola tabla**, así que no la puede destapar. Se arrastra para que no se pierda.
4. **¿Qué se hace cuando un pedido entregado no debió salir?** Heredada de QC-34 (su pregunta
   abierta 1) y sigue abierta: de `ENTREGADO` no se sale, y no hay flujo de devolución. La pantalla
   lo refleja deshabilitando editar, cancelar y borrar; no inventa la salida.
5. **¿El sistema exporta alguna vez a un contable externo?** Heredada de QC-33 y QC-34. No afecta a
   esta ficha; se arrastra.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-06 | ¿Tabla compartida o esqueleto copiado? | **Estrena la tabla compartida de QC-55.** Lleva mergeada desde el 2026-09-04 sin ningún consumidor y una pantalla nueva es el sitio natural para estrenarla. QC-35 absorbe con ella las tres deudas que QC-55 dejó escritas, la primera de las cuales es **bloqueante** (ver P1). La comprobación en Safari de iOS **NO se mueve aquí**: sigue siendo de QC-56 por decisión humana del 2026-09-04 |
| 2026-09-06 | ¿Una ruta o dos? | **Una.** Lista, alta, edición, cancelación y borrado ocurren todos en la ruta de pedidos. No hay página de detalle: el pedido no tiene nada colgando de él, a diferencia del proveedor y su catálogo (QC-44) |
| 2026-09-06 | Alta y edición | **Panel lateral (`sheet` de shadcn/ui).** El pedido tiene cinco campos de negocio —receta, cantidad, unidad, precio unitario y prioridad— y cabe de sobra. Heredado de QC-22 y QC-44; **no** se sigue a QC-26, que usó páginas porque su formulario lleva líneas, pasos e imagen |
| 2026-09-06 | ¿Desde dónde se cambia el estado? | **Solo desde el formulario de edición**, como un campo más. Ni desplegable por fila ni acción rápida en la lista: pasar a `ENTREGADO` cierra el pedido para siempre —no se edita, no se cancela, no se borra— y no hay flujo de devolución (P4). Un solo camino de escritura y un solo sitio donde presentar el error |
| 2026-09-06 | Selector de receta | **Con búsqueda por nombre, que va al SERVIDOR y nunca al array ya descargado.** Mismo patrón que `product-picker.tsx` de QC-26, que compone `Button` e `Input` del CLI en vez de reinventar un primitivo. Es posible porque **QC-57 ya le dio `search` a `recetas`**; antes del 2026-09-06 no lo era |
| 2026-09-06 | Selector de unidad | **Solo elige de las existentes**, con `listUnitsAction`. No permite crear: el alta de unidades es QC-38 y su pantalla QC-39. Heredado de QC-44 |
| 2026-09-06 | ¿Se muestra el total del pedido? | **NO en esta ficha, y la decisión de FONDO sí queda cerrada**: el total se va a mostrar, y lo calcula el **SERVIDOR**, nunca la pantalla. Eso cierra la pregunta abierta 3 que QC-34 dejó escrita para esta ficha. Multiplicar dos `Decimal(14,4)` no se puede hacer con el tipo numérico de JavaScript, pero **Prisma ya opera decimales en el servidor**: la consulta devolverá `total` como cadena decimal. **Así NO entra `decimal.js`** ni ninguna dependencia nueva, y el trámite de la regla 7 se evita entero. El trabajo es **QC-68**, y QC-35 **no lo espera**: la lista nace sin columna de total |
| 2026-09-06 | Importes | **Cadena decimal, tal como los entrega la consulta.** No se convierten a coma flotante ni se opera aritméticamente con ellos —ni siquiera para el total, que ya llega hecho—. Heredado de QC-22 R8 y QC-44 |
| 2026-09-06 | Orden por cabecera | **SÍ, en número de pedido, fecha, prioridad y estado.** Los cuatro están en `ORDER_QUERYABLE.sortable`, que QC-57 dejó mergeado. El **orden por defecto no cambia**: prioridad y luego antigüedad, como ya lo entrega la consulta y como pide la ficha del board |
| 2026-09-06 | Filtros de la lista | **Estado y prioridad como selección de valores**, que es lo que pide la ficha, **más rango de fechas**, que `ORDER_QUERYABLE.filterable` ya declara y la tabla compartida ya sabe dibujar. Se aplican sobre el conjunto completo, nunca sobre la página traída (QC-57) |
| 2026-09-06 | Fijar columna | **Se fija la columna del número de pedido**, que queda quieta al hacer scroll horizontal |
| 2026-09-06 | Búsqueda en la lista | **NO la lleva esta ficha, y la barra no monta una caja de búsqueda.** Cuando llegue será **por nombre de receta**, y es trabajo de backend que hoy no existe: QC-57 dejó pedidos como la única de las siete listas con `searchable: false`, porque `orders` no tiene columna `name` y el nombre de la receta lo resuelve el caso de uso pidiéndoselo a `recetas`. Va en **QC-68**, junto con el total, y QC-35 **no lo espera**. **Y en ningún caso se busca en cliente**: filtrar el array descargado solo miraría la página visible y mentiría sobre el listado |
| 2026-09-06 | ¿E2E? | **SÍ, el camino completo**: login → pedidos → alta → verlo en la lista → cancelarlo con motivo → ver el motivo, más el rechazo de un no-Administrador. `CHECKPOINTS.md` lo pide para permisos e importes y esta pantalla toca los dos. Mismo criterio que cerró QC-44 |
| 2026-09-06 | Cancelar un pedido | **Acción propia con diálogo que exige el motivo**, distinta de editar y de borrar. La lista **muestra el motivo** en los pedidos cancelados. El único camino a `CANCELADO` es `cancelOrderAction`: `updateOrderAction` no puede ni formularlo (QC-34) |
| 2026-09-06 | Borrar un pedido | **Diálogo de confirmación que nombra el pedido por su correlativo.** En base es borrado lógico, pero el backend no expone forma de restaurar: para el usuario es irreversible y se presenta como tal. Heredado de QC-22 y QC-44 |
| 2026-09-06 | Entregado y cancelado | **La pantalla lo refleja en vez de dejar intentarlo**: editar, cancelar y borrar quedan deshabilitados con su motivo visible, no habilitados para fallar contra el servidor. El backend lo impide igual (QC-34); la pantalla no repite la regla, la anticipa |
| 2026-09-06 | Fecha de solicitud | **No hay campo.** La pone el sistema y no se edita, tal como manda la ficha del board. Se muestra en la lista y ordena por ella |
| 2026-09-06 | Prioridad | **Opcional en el formulario, con `BAJA` como valor por defecto VISIBLE**, no implícito. Los cuatro valores salen de `ORDER_PRIORITY_VALUES` |
| 2026-09-06 | Tamaño de página | **Selector de 10 y 25**, que es lo que ya expone `PAGE_SIZE_OPTIONS` de la tabla compartida. Heredado de QC-22 y QC-44 |
| 2026-09-06 | Ruta y ubicación en el menú | **Constante única en `lib/shared/routes.ts`** —no en `private-nav.ts`—, porque el middleware y la regla ruta→rol la necesitan y no pueden depender de la navegación. Ítem de nivel superior en la sección **«Operación»**: un pedido es producción, no cadena de suministro. Ningún archivo incrusta la URL como literal (QC-11 R13) |
| 2026-09-06 | Protección de la ruta | **Entra en esta ficha.** La URL se añade a `PRIVATE_ROUTE_PREFIXES` —el guard `guard-rutas-privadas-cubiertas` pone el gate en rojo si no— y se declara su **regla ruta→rol restringida a Administrador**, tercera del repo tras QC-22 y QC-44 |
| 2026-09-06 | Autorización sobre los datos | **La pantalla no la aporta ni la repite.** Los seis casos de uso de `pedidos` ya llaman a `requireAdmin` como primera línea (QC-34 R1). Que una regla ruta→rol deje pasar no autoriza nada (QC-9 R29) |
| 2026-09-06 | Mutaciones | **Server Actions**, las cinco que QC-34 expone en `order-actions.ts`, importadas por su ruta exacta —los adaptadores driving no pasan por el barrel, y el propio `index.ts` de `pedidos` lo dice—. Prohibido `fetch` a API routes propias. Heredado de QC-11 |
| 2026-09-06 | Validación del formulario | **Con los esquemas `zod` del contrato público de `pedidos`**, los mismos que valida la Server Action: no se escribe una segunda copia. `<form action>` + `useActionState`; **no** entra `react-hook-form` (QC-22 P2) |
| 2026-09-06 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo.** `<Toaster />` ya lo monta QC-22 en el layout privado: **no se vuelve a montar** |
| 2026-09-06 | Estados de la pantalla | **Vacío, cargando y error**, los tres declarados. `resolveDataTableState` de QC-55 ya los despacha; esta pantalla aporta los textos, no la lógica |
| 2026-09-06 | Desbordamiento de la tabla | **Scroll horizontal contenido en la propia tabla**, nunca del `body`, con las acciones de fila siempre alcanzables. Se comprueba en viewport angosto |
| 2026-09-06 | Route group y componentes | **`app/(private)/`** (QC-11 D1) y componentes en `<ruta>/components/` con barrel `index.ts` (QC-12) |
| 2026-09-06 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (QC-11, `CHECKPOINTS.md > Permisos`) |
| 2026-09-06 | Librería de componentes | **shadcn/ui por CLI**; ningún primitivo se escribe ni se edita a mano. Si hiciera falta una librería de verdad, el `frontend_dev` **para y la propone** (regla 7 de `CLAUDE.md`) |
| 2026-09-06 | Rutas y asserts | Rutas siempre en constantes exportadas. Los tests afirman sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy. Heredado de QC-11, QC-22 y QC-44 |
| 2026-09-06 | Multiplataforma | Se valida contra angosto y ancho con `tests/helpers/viewport.ts`. **Sin excepción de escritorio.** Heredado de QC-11 |
| 2026-09-06 | Base heredada | shadcn/ui, Vitest, Playwright, layout privado, sidebar, `<Toaster />` y la **tabla compartida de QC-55** están montados y no se re-crean. El choque entre las features 4 y 10 ya ocurrió una vez en este repo |
