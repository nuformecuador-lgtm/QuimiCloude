# QC-45 — pantalla-de-presentaciones · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** QC-22 · **Rama**
> `feature/QC-45-pantalla-de-presentaciones`
>
> **Alcance.** El catálogo de presentaciones (bidón, tambor, saco) en
> **`configuracion/presentaciones`**, dentro de una sección **Configuración** de la navegación
> privada que **esta ficha crea**: la lista con búsqueda y orden por nombre, el alta y la edición
> en panel lateral, y el borrado con confirmación. Las cuatro operaciones **ya existen** como
> Server Actions de QC-20. Solo la ve el Administrador.
>
> **Lo que NO entra.** Filtrar el menú entero por permiso → **QC-75**, que sustituye el ocultado a
> mano que esta ficha deja. El ítem de Unidades en esa sección → **QC-39**. Migrar las listas de
> productos y recetas a la tabla compartida → **QC-56**. Tocar los casos de uso de `inventario` →
> **nada: ya están construidos**.
>
> *Sembrado por `/afinar-feature` el 2026-09-07. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de presentaciones**: la página que esta ficha crea, servida en la
> URL que declara su constante de ruta. **Layout privado**: el armazón de QC-11 (sidebar +
> cabecera + `<main>` + `<Toaster />`) que envuelve todo `app/(private)/`; se hereda montado.
> **Tabla compartida**: `components/shared/data-table`, la de QC-55, consumida por su barrel
> público. **Panel lateral**: el `sheet` donde ocurren el alta y la edición. **Operaciones del
> catálogo**: las cuatro Server Actions que QC-20 ya expone (`listPresentationsAction`,
> `createPresentationAction`, `updatePresentationAction`, `deletePresentationAction`).
> **Parámetros de lista**: página, tamaño de página, orden y término de búsqueda.

### Ubicación, ruta y navegación

**R1** — El sistema DEBE exponer la pantalla de presentaciones en la URL que declara su constante
de ruta, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por el layout
privado existente** y sin declarar armazón propio: NO DEBE declarar un `main`, ni una barra
lateral, ni una cabecera propias.

**R2** — La URL de la pantalla DEBE estar declarada en **una sola** constante exportada, y todo
consumidor —el ítem de navegación, la lista de prefijos privados, la regla ruta→rol y cualquier
destino de navegación de la propia pantalla— DEBE derivarse de esa misma constante. Ningún archivo
de producto DEBE incrustar la URL como literal.

**R3** — La navegación privada DEBE ganar una sección **Configuración** que contenga **exactamente
un** ítem, el de presentaciones, apuntando a la constante de R2. El sistema NO DEBE añadir en esa
sección ningún ítem que apunte a una ruta sin pantalla.

**R4** — MIENTRAS la sesión no tenga el rol Administrador, el sistema NO DEBE presentar el ítem de
presentaciones ni el encabezado de la sección Configuración; MIENTRAS la sesión tenga el rol
Administrador, DEBE presentar los dos. La decisión DEBE tomarse en el servidor a partir de los
datos de sesión que el layout privado ya obtiene, y el componente de navegación NO DEBE obtener
esos datos por su cuenta.

### Protección y autorización

**R5** — La URL de la pantalla DEBE quedar cubierta por la lista declarada de prefijos de ruta
privada, de modo que una petición sin sesión válida sea redirigida al login antes de renderizarla.

**R6** — El sistema DEBE declarar una regla ruta→rol que restrinja la pantalla al rol
Administrador. MIENTRAS la sesión tenga un rol distinto de Administrador, el sistema DEBE
redirigirla fuera de la pantalla sin renderizar su contenido; MIENTRAS tenga el rol Administrador,
DEBE permitir el acceso.

**R7** — La pantalla NO DEBE tomar ninguna decisión de autorización sobre los datos ni repetir la
que ya toman las operaciones del catálogo: toda lectura y toda escritura DEBEN pasar por esas
operaciones. SI una operación responde con un error de autorización, ENTONCES el sistema DEBE
presentar ese error y NO DEBE mostrar ningún dato del catálogo.

### Lista de presentaciones

**R8** — La lista DEBE presentarse con la **tabla de datos compartida** consumida por su barrel
público. El sistema NO DEBE declarar una tabla propia, ni una barra de paginación propia, ni
copiar el esqueleto de lista de ninguna otra pantalla.

**R9** — La tabla DEBE presentar exactamente **dos columnas**: el nombre de la presentación y las
acciones de fila. NO DEBE presentar el identificador técnico, las marcas de tiempo ni ningún dato
de autoría.

**R10** — La pantalla DEBE ofrecer búsqueda por nombre. CUANDO el usuario cambie el término de
búsqueda, el sistema DEBE volver a pedir la lista al servidor **sobre el conjunto entero** del
catálogo y NO DEBE filtrar en el cliente sobre la página visible.

**R11** — La columna de nombre DEBE ofrecer orden ascendente y descendente. CUANDO el usuario
cambie el orden, el sistema DEBE volver a pedir la lista al servidor con ese orden y NO DEBE
reordenar en el cliente. La columna de acciones NO DEBE ser ordenable ni filtrable.

**R12** — La pantalla DEBE ofrecer un selector de tamaño de página con exactamente dos opciones,
10 y 25, y DEBE usar 10 cuando no se indique ninguno. CUANDO el usuario cambie el tamaño de
página, el sistema DEBE recargar la lista con el nuevo tamaño.

**R13** — CUANDO existan más presentaciones de las que caben en una página, el sistema DEBE
permitir avanzar y retroceder de página e indicar la página actual y el total de páginas.

**R14** — SI los parámetros de lista recibidos son inválidos, están fuera de rango, exceden el
tope soportado o nombran un campo que el catálogo no admite, ENTONCES el sistema DEBE acotarlos a
valores válidos y presentar la lista, y NO DEBE fallar ni mostrar un error.

**R15** — MIENTRAS el catálogo no tenga ninguna presentación, el sistema DEBE presentar un estado
vacío identificable que ofrezca la acción de **crear la primera**, en lugar de una tabla sin filas.
SI la página pedida se quedó sin elementos por ser mayor que el total, ENTONCES el estado vacío
DEBE ofrecer volver a la primera página.

**R16** — MIENTRAS la lista se está obteniendo, el sistema DEBE presentar un indicador de carga
identificable en lugar de la tabla.

**R17** — SI la operación de consulta responde con error, ENTONCES el sistema DEBE presentar un
estado de error identificable con el mensaje devuelto y una acción para reintentar, y NO DEBE
presentar una tabla vacía como si el catálogo estuviera vacío.

**R18** — MIENTRAS el ancho disponible no alcance para las dos columnas, el sistema DEBE resolver
el desbordamiento con **scroll horizontal contenido en la propia tabla**, sin provocar scroll
horizontal del documento, y las acciones de fila DEBEN seguir siendo alcanzables.

### Acciones de fila

**R19** — Cada fila DEBE ofrecer las acciones de **editar** y **borrar** esa presentación, ambas
presentes en el DOM y visibles desde el primer render, cada una con nombre accesible que identifique
la presentación sobre la que actúa.

**R20** — La columna de acciones DEBE declararse con el contrato de columnas que la tabla
compartida ya publica. El sistema NO DEBE añadir a la tabla compartida ninguna propiedad ni
mecanismo nuevo para pintar acciones de fila, y NO DEBE modificar los archivos de
`components/shared/data-table/`.

### Alta y edición

**R21** — CUANDO el usuario active la acción de crear o la de editar una presentación, el sistema
DEBE abrir el formulario en un **panel lateral** sobre la lista, NO DEBE navegar a otra URL de
pantalla completa y NO DEBE usar un diálogo modal centrado. CUANDO el panel se cierre —por guardado
o por cancelación—, el sistema DEBE devolver al usuario a la lista **con los mismos parámetros de
lista** que tenía antes de abrirlo.

**R22** — El formulario de alta DEBE capturar el nombre —único campo de negocio de una
presentación— y enviarlo mediante la operación de alta del catálogo. NO DEBE capturar ningún otro
campo.

**R23** — CUANDO el usuario abra el formulario de edición de una presentación, el sistema DEBE
precargarlo con el nombre actual de esa presentación y enviar el **reemplazo completo** mediante la
operación de edición.

**R24** — SI el guardado se rechaza por validación o por cualquier otro error de la operación,
ENTONCES el sistema DEBE presentar el error **en línea dentro del formulario** —junto al campo
cuando el error identifique uno, y en una región de error del formulario cuando no—, DEBE decidir
qué pintar por el **código** estable del error y nunca por su texto, y NO DEBE cerrar el panel ni
perder lo escrito.

**R25** — CUANDO una operación de alta, edición o borrado termine con éxito, el sistema DEBE cerrar
el panel o el diálogo abierto, notificar el éxito mediante un aviso emergente (toast) y actualizar
la lista para que refleje el cambio sin que el usuario tenga que recargar la pantalla y sin perder
los parámetros de lista vigentes.

**R26** — El sistema DEBE emitir sus avisos emergentes sobre la región que el layout privado ya
monta, y NO DEBE montar una segunda región de avisos: en la zona privada DEBE seguir habiendo
exactamente una.

### Borrado

**R27** — CUANDO el usuario active el borrado de una presentación, el sistema DEBE pedir
confirmación en un diálogo que **nombre esa presentación** y advierta que la acción no se puede
deshacer. MIENTRAS el usuario no confirme, el sistema NO DEBE invocar la operación de borrado;
CUANDO confirme, DEBE invocarla y aplicar R25.

**R28** — SI la operación de borrado se rechaza porque algún producto usa la presentación, ENTONCES
el sistema DEBE presentar ese error **dentro del diálogo de confirmación**, DEBE mantener el diálogo
abierto y NO DEBE retirar la fila de la lista.

### Estructura, convenciones y plataforma

**R29** — Los componentes propios de la pantalla DEBEN vivir en la carpeta `components/` de la ruta
y exponerse por su barrel `index.ts`; la página NO DEBE importarlos por ruta profunda ni dejarlos
sueltos junto a `page.tsx`.

**R30** — Toda mutación y toda lectura del catálogo DEBEN realizarse mediante las Server Actions ya
publicadas por el módulo; el sistema NO DEBE llamar a rutas API propias con `fetch` ni abrir
`lib/modules/inventario/` para nada que no sea consumir su contrato público y sus adaptadores
driving.

**R31** — Las primitivas de interfaz que la pantalla necesite DEBEN provenir de la librería de
componentes por su CLI; el sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`,
y NO DEBE añadir ninguna dependencia a `package.json`.

**R32** — Los componentes de cliente de la pantalla DEBEN recibir por props los datos de sesión y
los datos de catálogo que muestran; NO DEBEN importar el punto de composición, ni el cliente de
base de datos, ni obtener esos datos por su cuenta.

**R33** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la región de
avisos, las primitivas ya instaladas, la tabla compartida ni las utilidades de test: los hereda.
Los únicos archivos heredados que esta feature puede modificar son los que exigen R2 (constante de
ruta), R3 y R4 (navegación privada y su filtrado), R5 (prefijos privados) y R6 (reglas ruta→rol).

**R34** — La pantalla DEBE ser utilizable en viewport angosto y en viewport ancho: NO DEBE usar
`100vh` como alto de pantalla, NO DEBE depender de `:hover` como única vía para descubrir o activar
una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de formulario DEBEN
tener un tamaño de fuente de al menos 16 px. NO DEBE declararse ninguna excepción de escritorio.

**R35** — Los tests de la pantalla DEBEN identificar controles, estados y destinos por rol ARIA,
`data-testid` o constantes exportadas, y NO DEBEN afirmar sobre literales de copy.

**R36** — El sistema DEBE quedar cubierto por una prueba de extremo a extremo que recorra login →
la pantalla → alta de una presentación → verla en la lista, y por otra que compruebe que una sesión
sin el rol Administrador no llega a la pantalla.

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). **Ninguna bloquea.**

1. **La pregunta abierta 4 de QC-55 sigue viva: cómo se declara una columna de acciones de fila.**
   La configuración de columnas de la tabla compartida devuelve **cadena** (`value: (row) =>
   string`), y esta pantalla necesita **dos botones** —editar y borrar— en la última columna, más
   un estado vacío que ofrece «crear la primera». Posición por defecto escrita aquí: **si al
   construir no está resuelta, la resuelve esta ficha** y **QC-56 hereda la respuesta** en vez de
   volver a decidirla. No se difiere en silencio.

   **HEREDADA RESUELTA — comprobado en el worktree el 2026-09-07 (F1.2), no la resuelve esta
   ficha.** La resolvió **QC-35** al estrenar la tabla compartida, y ya está mergeada:
   `DataTableColumn.cell` devuelve **`ReactNode`**, no `string`
   (`components/shared/data-table/data-table-types.ts:67`), y `DataTableProps.emptyAction` es
   también `ReactNode` (`:147`). La columna de acciones es por tanto una **columna normal** con
   `pinnable: false` —`app/(private)/pedidos/components/order-columns.tsx:178-185`, que deja
   escrito «Esto es lo que QC-56 adopta»—. Esta ficha **usa** esa respuesta y **no toca**
   `components/shared/data-table/` (R20). Detalle en `design.md > 6`.
2. **Qué más acaba viviendo en Configuración.** Presentaciones (esta ficha) y unidades (QC-39)
   están decididas. Si roles, datos de la empresa o usuarios acaban ahí, no se evaluó.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-07 | ¿Dónde vive la pantalla? | **`configuracion/presentaciones`**, dentro de una sección **Configuración** de la navegación privada. Presentaciones y unidades son los dos catálogos cortos de apoyo del ERP, y agruparlos deja Inventario para lo que se opera de verdad. **Cierra la pregunta que QC-76 dejó abierta** |
| 2026-09-07 | ¿Quién crea la sección Configuración? | **Esta ficha.** QC-39 decía que la creaba ella; llega después, así que **añade su ítem** a una sección que ya existe. Corregido en el issue QC-39 el mismo día |
| 2026-09-07 | ¿Con cuántos ítems nace la sección? | **Uno solo: presentaciones.** Añadir «Unidades» apuntando a un 404 hasta que llegue QC-39 sería repetir **exactamente** la deuda de los cinco ítems de navegación de **QC-11**, que hoy siguen dando 404 |
| 2026-09-07 | ¿Un no-Administrador ve el ítem de Configuración? | **No: se oculta.** Es el **primer ítem del menú que se comporta así**, resuelto a mano y solo para este, y **provisional a propósito**: **QC-75** arma el menú entero en el servidor con permisos y **sustituye** esto — no se convive con las dos cosas. Anotado como encargo en el issue QC-75 |
| 2026-09-07 | ¿La lista usa la tabla compartida de QC-55? | **Sí.** Es una lista **nueva**: escribirla a mano sería añadir una **tercera copia** del esqueleto —parser de URL, sección, tabla, paginación, vacío, error y carga— que es justo el código que **QC-56** existe para borrar |
| 2026-09-07 | ¿Búsqueda y orden? | **Sí, por nombre.** **QC-57** ya dejó ese soporte hecho para presentaciones (`PRESENTATION_QUERYABLE`), así que el motivo por el que **QC-22** lo descartó —«el backend solo acepta `page` y `pageSize`»— **ya no es cierto**. No usarlo sería dejar muerto trabajo ya hecho |
| 2026-09-07 | ¿E2E? | **Sí, ligera**: login → la pantalla → crear una presentación → verla en la lista, más el **rechazo de un no-Administrador**. `CHECKPOINTS.md` lo pide cuando hay permisos, la infraestructura de Playwright ya está montada, y es el mismo camino que **QC-22** hizo para productos |
| 2026-09-07 | ¿Quién puede? | **Solo el Administrador**, ya lo decía la ficha del board. Los cuatro casos de uso de `inventario` **ya validan** con su test: la pantalla no repite la decisión ni la sustituye (**QC-20 D2**, `docs/architecture.md > Acceso a datos y autorizacion`) |
| 2026-09-07 | ¿Qué columnas tiene la lista? | **El nombre, y las acciones de fila.** `Presentation` no tiene más campos de negocio: solo `name` más id y marcas de tiempo. No se pinta quién creó ni cuándo (**QC-22**, misma decisión para productos) |
| 2026-09-07 | Alta y edición: ¿modal o página? | **Panel lateral (`sheet` de shadcn/ui)**, heredado de **QC-22**: al guardar se vuelve a la lista sin perder la página en la que estabas |
| 2026-09-07 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo**, heredado de **QC-22**. El `<Toaster />` ya lo monta el layout privado desde esa ficha: aquí no se vuelve a montar |
| 2026-09-07 | Borrado | **Con diálogo de confirmación** nombrando la presentación, heredado de **QC-22** |
| 2026-09-07 | ¿Y si la presentación está en uso? | **Se rechaza y el error se pinta en el diálogo.** El borrado es **físico** y lo bloquea la FK (`ON DELETE RESTRICT`): `presentations` no lleva `deleted_at` precisamente para que la FK pueda impedirlo (**QC-14**, **QC-20 D6**) |
| 2026-09-07 | Tamaño de página | **Selector de 10 y 25**, heredado de **QC-22**. `DEFAULT_PAGE_SIZE` es 10 y el tope es 25, y `toOffsetLimit` **acota** por encima en vez de rechazar |
| 2026-09-07 | Estado vacío | **Ofrece crear la primera**, como `product-list-empty` y `recipe-list-empty`. Es parte de la pregunta abierta 1 |
| 2026-09-07 | Estados de la lista | **Vacío, cargando y error**, los tres, siguiendo el reparto de **QC-22** entre la sección que pide los datos y los componentes que los pintan |
| 2026-09-07 | Protección de la ruta | **Entra**, con su regla en `route-role-rules` y su test. `PRIVATE_ROUTE_PREFIXES` tiene un guard que **pone el gate en rojo** si aparece una pantalla bajo `app/(private)/` sin prefijo que la cubra (**QC-9**, **QC-22**) |
| 2026-09-07 | ¿Dónde vive la constante de ruta? | **En un solo sitio, reutilizada**, como `DASHBOARD_ROUTE` e `INVENTORY_ROUTE`. Nunca un literal. «Dos constantes con la misma ruta es como se acaba con `/dashboard` y `/panel` conviviendo» (**QC-11 R13**, **QC-22**) |
| 2026-09-07 | Route group y componentes | **`app/(private)/`** (**QC-11 D1**), y los componentes en `<ruta>/components/` con barrel `index.ts` (**QC-12**): «la consistencia vale más que ahorrar una carpeta» |
| 2026-09-07 | Mutaciones | **Server Actions**, las cuatro que **QC-20** ya expone. Prohibido `fetch` a una API route propia (**QC-11**) |
| 2026-09-07 | Librería de componentes | **shadcn/ui por CLI.** Ningún primitivo se escribe ni se edita a mano en `components/ui/` (**QC-11**). Si hiciera falta una **librería** de verdad, el `frontend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`) |
| 2026-09-07 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (**QC-11**, `CHECKPOINTS.md > Permisos`) |
| 2026-09-07 | Asserts de los tests | Sobre **roles ARIA, `data-testid` y constantes exportadas**; **nunca** sobre literales de copy (**QC-11**, **QC-22**) |
| 2026-09-07 | Multiplataforma | Se valida contra angosto y ancho con `tests/helpers/viewport.ts`. **Ninguna excepción de escritorio.** El desbordamiento se resuelve con scroll horizontal **contenido en la tabla**, nunca del `body` (**QC-11**, **QC-22**) |
| 2026-09-07 | Base heredada | **shadcn/ui, Vitest, layout privado, sidebar, `<Toaster />` y la tabla compartida de QC-55 están montados y NO se re-crean.** El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la T0 de `specs/11-*/tasks.md` existe para que no se repita |
| 2026-09-07 | Librería nueva | **Ninguna.** Todo lo que hace falta está aprobado y montado |
