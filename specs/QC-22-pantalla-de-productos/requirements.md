# QC-22 — pantalla-de-productos · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** `QC-20` · **Rama** `feature/QC-22-pantalla-de-productos`
>
> **Alcance.** La pantalla del catálogo de productos en `/inventario`, dentro del layout
> privado: la lista paginada, el alta y la edición en un panel lateral (`sheet` de shadcn/ui) y
> el borrado con confirmación. Solo la ve el Administrador, y esta ficha declara la **primera
> regla ruta→rol del repo**. Las nueve operaciones ya existen y las expone QC-20 como Server
> Actions: aquí entra la capa visual y sus tres estados (vacío, cargando, error). El selector de
> presentación permite **crear** una presentación sin salir del formulario, porque un producto no
> puede existir sin ella.
>
> **Lo que NO entra.** La pantalla del catálogo de presentaciones —listarlas, editarlas,
> borrarlas— va a **QC-45 — Pantalla de presentaciones**, creada en el board el 2026-09-03 al
> acotar esta ficha y bloqueada por ella. Búsqueda y orden configurable: el backend no los
> soporta y meterlos sería reabrir QC-20, que ya está `done`; si se quieren, es una ficha de
> backend nueva. El nombre de quien creó o modificó un producto: el backend guarda ids, no
> nombres (QC-20, D20). Y nada de backend: esta ficha no abre `lib/modules/inventario/` salvo
> para consumir su contrato público.
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

> **Glosario mínimo.** **Pantalla de productos**: la página que esta ficha crea, servida en la URL
> que declara la constante de ruta de inventario. **Layout privado**: el armazón de QC-11
> (sidebar + cabecera + `<main>`) que envuelve todo `app/(private)/`; se hereda montado.
> **Panel lateral**: el `sheet` donde ocurren el alta y la edición. **Columnas de negocio**: los
> campos de `ProductView` salvo el identificador técnico y los ids de autoría
> (`createdBy`/`updatedBy`), que la decisión del 2026-09-03 deja fuera.
> **Operaciones del catálogo**: las Server Actions que QC-20 ya expone
> (`listProductsAction`, `createProductAction`, `updateProductAction`, `deleteProductAction`,
> `listPresentationsAction`, `createPresentationAction`).

### Ubicación, ruta y protección

**R1** — El sistema DEBE exponer la pantalla de productos en la URL que declara la constante de
ruta de inventario, dentro del grupo de rutas privadas, de modo que se renderice **envuelta por
el layout privado existente** y sin declarar ningún armazón propio (no DEBE declarar un `main`
propio).

**R2** — La URL de la pantalla DEBE estar declarada en **una sola** constante exportada, y todo
consumidor —el ítem de navegación de la barra lateral, la lista de prefijos privados, la regla
ruta→rol y cualquier destino de navegación de la propia pantalla— DEBE derivarse de esa misma
constante. Ningún archivo de producto DEBE incrustar la URL como literal.

**R3** — La URL de la pantalla DEBE quedar cubierta por la lista declarada de prefijos de ruta
privada, de modo que una petición sin sesión válida sea redirigida al login antes de renderizarla.

**R4** — El sistema DEBE declarar una regla ruta→rol que restrinja la pantalla al rol
Administrador. MIENTRAS la sesión tenga un rol distinto de Administrador, el sistema DEBE
redirigirla fuera de la pantalla sin renderizar su contenido; MIENTRAS la sesión tenga el rol
Administrador, DEBE permitir el acceso.

**R5** — La pantalla NO DEBE tomar ninguna decisión de autorización sobre los datos ni repetir la
que ya toman las operaciones del catálogo: toda lectura y toda escritura DEBEN pasar por esas
operaciones. SI una operación responde con un error de autorización, ENTONCES el sistema DEBE
presentar ese error y NO DEBE mostrar datos del catálogo.

### Lista de productos

**R6** — La pantalla DEBE presentar los productos en una tabla paginada con **todas** las columnas
de negocio: nombre, presentación, existencia, unidad, costo, compra mínima, tiempo de entrega,
alerta de cantidad, fecha de creación y fecha de actualización.

**R7** — La lista NO DEBE mostrar el identificador ni el nombre de quien creó o modificó un
producto.

> **ENMIENDA DEL 2026-09-07 (decisión humana).** La tabla gana una **primera columna de imagen**,
> antes del nombre: la miniatura de `products.image_path` con la miniatura compartida
> `components/shared/entity-image.tsx`. `ProductView` expone ahora `imagePath` —la RUTA guardada,
> sin componer URL pública: `inventario` no tiene puerto de almacenamiento, a diferencia de
> `recetas`—.
>
> Mientras nadie llene esa columna —hoy no hay forma de subir la imagen de un producto— todas las
> filas muestran el **marcador** `public/inv_not_found.png`, que cubre los dos casos: ruta ausente
> y ruta que no resuelve.
>
> R6 y R7 no se relajan: la imagen **no es una columna de datos** —su tipo de id sigue derivándose
> de `ProductView` excluyendo lo prohibido, así que `id: 'imagePath'` no compila—, y `imagePath`
> sigue fuera de `PRODUCT_QUERYABLE`: no se ordena ni se filtra por una ruta de archivo.

**R8** — El sistema DEBE presentar el costo tal como lo entrega la operación de consulta (cadena
decimal) y NO DEBE convertirlo a coma flotante ni operar aritméticamente con él.

**R9** — MIENTRAS el ancho disponible no alcance para todas las columnas, el sistema DEBE resolver
el desbordamiento con **scroll horizontal contenido en la propia tabla**, sin provocar scroll
horizontal del documento, y los controles de acción de cada fila DEBEN seguir siendo alcanzables.

**R10** — La pantalla DEBE ofrecer un selector de tamaño de página con exactamente dos opciones,
10 y 25, y DEBE usar 10 cuando no se indique ninguno. CUANDO el usuario cambie el tamaño de
página, el sistema DEBE recargar la lista con el nuevo tamaño.

**R11** — CUANDO existan más productos de los que caben en una página, el sistema DEBE permitir
avanzar y retroceder de página e indicar la página actual y el total de páginas.

**R12** — SI los parámetros de paginación recibidos son inválidos, están fuera de rango o exceden
el tope soportado, ENTONCES el sistema DEBE acotarlos a valores válidos y presentar la lista, y
NO DEBE fallar ni mostrar un error.

**R13** — La pantalla NO DEBE ofrecer búsqueda de productos ni control de ordenación configurable.

> **ENMIENDA DEL 2026-09-07 (decisión humana).** La pantalla **monta la tabla compartida**
> (`components/shared/data-table`, la misma de pedidos y recetas) en lugar de su tabla y su barra
> de paginación propias —`product-list-toolbar.tsx` **desaparece**—. Con ella:
>
> - **R13 se INVIERTE**: la pantalla **sí** ofrece búsqueda y orden por columna. La razón es que
>   el backend los soporta —`PRODUCT_QUERYABLE` declara `searchable: true` y su lista de campos
>   ordenables, y `listProducts` los resuelve contra la columna normalizada con su índice de
>   trigramas (QC-57)—; lo que R13 protegía de verdad **sigue en pie y afirmado**: ni la búsqueda
>   ni el orden ni los filtros se resuelven en el cliente. Cada gesto **navega** y la lista se
>   vuelve a pedir al servidor sobre el conjunto entero. Se añaden además filtros de rango para
>   existencia y alerta de cantidad, que la lista blanca ya declaraba.
> - **R10 y R11 no cambian de contenido, sí de dueño**: el selector de tamaño (10 y 25, con 10 por
>   defecto) y la paginación los pinta ahora la tabla compartida. Sus `data-testid` son los de esa
>   tabla (`data-table-page-size`, `data-table-previous`, `data-table-next`,
>   `data-table-page-indicator`).
> - **R12 se amplía**: los parámetros acotados pasan de `{ page, pageSize }` al contrato de lista
>   completo —orden, filtros y búsqueda—, y siguen sin poder producir un error.

**R14** — MIENTRAS el catálogo no tenga ningún producto, el sistema DEBE presentar un estado vacío
identificable que ofrezca la acción de crear el primer producto, en lugar de una tabla sin filas.

**R15** — MIENTRAS la lista se está obteniendo, el sistema DEBE presentar un indicador de carga
identificable en lugar de la tabla.

**R16** — SI la operación de consulta responde con error, ENTONCES el sistema DEBE presentar un
estado de error identificable con el mensaje devuelto y una acción para reintentar, y NO DEBE
presentar una tabla vacía como si el catálogo estuviera vacío.

### Alta y edición

**R17** — CUANDO el usuario active la acción de crear o la de editar un producto, el sistema DEBE
abrir el formulario en un **panel lateral** sobre la lista, NO DEBE navegar a otra URL de pantalla
completa y NO DEBE usar un diálogo modal centrado. CUANDO el panel se cierre —por guardado o por
cancelación—, el sistema DEBE devolver al usuario a la lista **en la misma página y con el mismo
tamaño de página** que tenía antes de abrirlo.

**R18** — El formulario de alta DEBE permitir capturar los campos de negocio del producto y
enviarlos mediante la operación de alta del catálogo.

**R19** — CUANDO el usuario abra el formulario de edición de un producto, el sistema DEBE
precargarlo con los valores actuales de ese producto y enviar el **reemplazo completo** mediante
la operación de edición.

**R20** — SI el guardado se rechaza por validación o por cualquier otro error de la operación,
ENTONCES el sistema DEBE presentar el error **en línea dentro del formulario** —junto al campo
cuando el error identifique uno, y en una región de error del formulario cuando no— y NO DEBE
cerrar el panel ni perder lo escrito.

**R21** — CUANDO una operación de alta, edición o borrado termine con éxito, el sistema DEBE
cerrar el panel abierto, notificar el éxito mediante un aviso emergente (toast) y actualizar la
lista para que refleje el cambio sin que el usuario tenga que recargar la pantalla.

**R22** — El layout privado DEBE montar la región de avisos emergentes, de modo que los toasts de
la zona privada sean visibles. *(Sustituye expresamente a R36 de QC-11, que la dejaba fuera.)*

**R23** — El sistema DEBE capturar la unidad del producto como **texto libre** opcional y NO DEBE
restringirla a un conjunto cerrado de valores.

**R24** — El formulario DEBE exigir una presentación para el producto y DEBE permitir alcanzar
cualquier presentación existente desde su selector, aunque haya más de las que caben en una
consulta. CUANDO no exista la presentación que el usuario necesita, el sistema DEBE permitir
crearla desde el propio formulario mediante la operación de alta de presentación, y CUANDO esa
creación termine con éxito, DEBE dejarla seleccionada sin perder lo ya escrito en el formulario.

**R25** — La pantalla NO DEBE ofrecer listar, editar ni borrar presentaciones; la única operación
de presentación disponible es su alta desde el selector (R24).

### Borrado

**R26** — CUANDO el usuario active el borrado de un producto, el sistema DEBE pedir confirmación
en un diálogo que **nombre el producto** y advierta que la acción no se puede deshacer. MIENTRAS
el usuario no confirme, el sistema NO DEBE invocar la operación de borrado; CUANDO confirme, DEBE
invocarla y aplicar R21.

### Estructura, convenciones y plataforma

**R27** — Los componentes propios de la pantalla DEBEN vivir en la carpeta `components/` de la
ruta y exponerse por su barrel `index.ts`; la página NO DEBE importarlos por ruta profunda ni
dejarlos sueltos junto a `page.tsx`.

**R28** — Toda mutación del catálogo DEBE realizarse mediante Server Actions ya publicadas por el
módulo; el sistema NO DEBE llamar a rutas API propias con `fetch` para leer ni para mutar.

**R29** — Las primitivas de interfaz que la pantalla necesite DEBEN provenir de la librería de
componentes por su CLI; el sistema NO DEBE escribir a mano ni editar archivos de `components/ui/`.

**R30** — Los componentes de cliente de la pantalla DEBEN recibir por props los datos de sesión y
los datos de catálogo que muestran; NO DEBEN importar el punto de composición, ni el cliente de
base de datos, ni obtener esos datos por su cuenta.

**R31** — La pantalla DEBE ser utilizable en viewport angosto y en viewport ancho: NO DEBE usar
`100vh` como alto de pantalla, NO DEBE depender de `:hover` como única vía para descubrir o
activar una acción, sus controles táctiles DEBEN medir al menos 44×44 px y sus campos de
formulario DEBEN tener un tamaño de fuente de al menos 16 px.

**R32** — El sistema NO DEBE re-crear ni duplicar el layout privado, la barra lateral, la
navegación privada, las primitivas ya instaladas ni las utilidades de test: los hereda. Los únicos
archivos heredados que esta feature puede modificar son los que exigen R2 (constante de ruta y su
reutilización), R3 (prefijos privados), R4 (reglas ruta→rol) y R22 (región de avisos del layout
privado).

## Preguntas abiertas

**P1 — Qué pasa con `/inventario` cuando llegue QC-45.** Hoy `/inventario` **es** la pantalla de
productos y el ítem del sidebar apunta ahí directo. Cuando entre la pantalla de presentaciones
habrá que decidir si `/inventario` pasa a ser un submenú con dos entradas
(`/inventario/productos` y `/inventario/presentaciones`) o si presentaciones cuelga de otra URL.
**Fuera del alcance de QC-22** y no se rellena con un supuesto (regla 6 de `CLAUDE.md`): lo
decide QC-45 al acotarse. Esta ficha deja la constante de ruta en un solo sitio justamente para
que ese cambio sea barato.

**P2 — La primitiva `form` de shadcn/ui arrastra dependencias nuevas.** La decisión del
2026-09-03 sobre la librería de componentes lista `form` entre las primitivas que se añaden por
CLI, y aclara que las primitivas de shadcn/ui **no** son librerías nuevas. El hecho que aparece al
escribir el diseño —y que la tabla no pudo prever— es que `shadcn add form` no es solo markup: su
plantilla monta `react-hook-form` y `@hookform/resolvers`, que **sí** serían dos entradas nuevas
en `package.json` y por tanto caen bajo la regla 7 de `CLAUDE.md` y bajo
`tests/guards/guard-dependencias-aprobadas.test.ts`. `table`, `select` y `alert-dialog` no tienen
ese problema (montan sobre `@base-ui/react`, ya instalado) y `sheet` **ya existe** en el repo
desde QC-11. **No se resuelve a ojo** (regla 6): `design.md > 8` deja la propuesta escrita con lo
que ahorraría, los cuatro checks y la alternativa —el patrón de formulario que el repo ya usa en
el login: `<form action>` no controlado + `useActionState` + los esquemas zod que el contrato
público de `inventario` ya exporta, sin ninguna dependencia nueva—. **Lo aprueba el humano al
aprobar el spec (F1.4).** Mientras no haya respuesta, el diseño asume la alternativa sin
dependencias, que es la que cumple R29 sin abrir la puerta 7.

**RESUELTA el 2026-09-03 al aprobar el spec (F1.4): NO entra la dependencia.** El humano
aprobó el spec tal como estaba presentado, y el diseño presentado es el de la alternativa sin
dependencias. `react-hook-form` y `@hookform/resolvers` **no se instalan**, `shadcn add form`
**no se corre**, y `docs/dependencias.md` **no cambia**: no hay fila que añadir porque no hay
dependencia nueva. Si al implementar el patrón `<form action>` + `useActionState` resultara
insuficiente para algún requisito, el `frontend_dev` **para y lo reporta al leader**; no instala
nada por su cuenta (regla 7 de `CLAUDE.md`, y `tests/guards/guard-dependencias-aprobadas.test.ts`
lo pondría en rojo igualmente).

Si durante la implementación aparece cualquier otra ambigüedad, el `frontend_dev` **para y la
reporta al leader**; no la rellena con supuestos.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Entra también el catálogo de presentaciones? | **NO. Solo productos.** La ficha del board pedía «lo mismo para el catálogo de presentaciones» y el humano lo sacó del alcance al acotar. La `description` del issue se reescribió y la pantalla salió a **QC-45**, creada el mismo día con `parent` QC-18, labels `sdd`/`slug:pantalla-de-presentaciones`/`zone:frontend` y link *is blocked by* QC-22 |
| 2026-09-03 | URL de la pantalla | **`/inventario`**, que es la constante placeholder que el sidebar de QC-11 ya trae apuntando a 404. Deja de ser placeholder: esta ficha la hace real. No se inventa una URL nueva |
| 2026-09-03 | ¿Dónde vive la constante de ruta? | **En un solo sitio, reutilizada**, siguiendo el precedente de `DASHBOARD_ROUTE` (declarada en `lib/shared/routes.ts` y reutilizada por `private-nav.ts`). El propio `private-nav.ts` deja escrito por qué: «dos constantes con la misma ruta es como se acaba con `/dashboard` y `/panel` conviviendo». El `design.md` fija el archivo exacto |
| 2026-09-03 | Protección de la ruta | **Entra en esta ficha, y es encargo heredado, no invento.** `route-role-rules.ts` de QC-9 dice literalmente que «las reglas concretas las trae la ficha de cada modulo (la primera sera la pantalla de productos, solo Administrador)». Además `PRIVATE_ROUTE_PREFIXES` tiene un guard (`tests/guards/guard-rutas-privadas-cubiertas.test.ts`) que **pone el gate en rojo** si aparece una pantalla bajo `app/(private)/` sin prefijo que la cubra. Las dos cosas entran, con su test |
| 2026-09-03 | Autorización sobre los datos | **No la aporta la regla ruta→rol.** El propio QC-9 lo advierte (R29): que una regla deje pasar no autoriza nada. Los nueve casos de uso de `inventario` ya llaman a `requireAdmin` como primera línea. La pantalla no repite la decisión ni la sustituye |
| 2026-09-03 | Alta y edición: ¿modal o página? | **Panel lateral (`sheet` de shadcn/ui)**, elegido por el humano y **con la primitiva ya aprobada para añadirse**. Ni modal centrado ni ruta aparte: al guardar se vuelve a la lista sin perder la página en la que estabas |
| 2026-09-03 | ¿Búsqueda y orden configurable? | **NO.** El backend de QC-20 solo acepta `page` y `pageSize` (`pageQuerySchema`) y ordena fijo por `name asc` en el adaptador. Filtrar en el cliente sería mentira: solo buscaría dentro de la página visible. Si se quieren, es **una ficha de backend nueva**, no un añadido aquí |
| 2026-09-03 | Tamaño de página | **Selector de 10 y 25.** No hay trabajo de backend: `DEFAULT_PAGE_SIZE` es 10, `MAX_PAGE_SIZE` es 25 y `toOffsetLimit` **acota** por encima en vez de rechazar |
| 2026-09-03 | Columnas de la lista | **Todas**, con el desbordamiento resuelto por **scroll horizontal contenido en la propia tabla** en viewport angosto. La regla de multiplataforma **no lo prohíbe** —prohíbe `100vh`, `:hover` como única vía y eventos solo-mouse—, pero sí exige que **el scroll anidado se compruebe en iOS** antes de darlo por bueno, y que las acciones sigan siendo alcanzables. El scroll horizontal es de la tabla, **nunca del `body`** |
| 2026-09-03 | Producto sin presentación disponible | **El selector permite crear una presentación ahí mismo.** Un producto no puede existir sin presentación (FK obligatoria con `Restrict`) y esta ficha ya no trae pantalla de presentaciones, así que sin esto una base con `presentations` vacía dejaría el alta muerta. Se usa `createPresentationAction`, que QC-20 ya expone. **Solo el alta**: listar, editar y borrar presentaciones sigue siendo de QC-45 |
| 2026-09-03 | Campo «unidad» | **Texto libre por ahora**, que es lo que la columna guarda hoy. **Retrabajo aceptado a conciencia**: QC-32 (`modelo-unidades`, en curso) convierte la unidad en catálogo propio, y cuando llegue este campo pasa a ser un selector. Rehacer un input es barato; bloquear esta ficha detrás de dos fichas de backend no lo era |
| 2026-09-03 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo.** `sonner` ya es dependencia aprobada y ya se usa en el login, **pero el layout privado no monta `<Toaster />`** —QC-11 lo dejó fuera expresamente (D9, R36)—: **esta ficha lo monta**. El error de validación se queda en el formulario, que es donde sirve; el éxito es toast porque el panel ya se cerró |
| 2026-09-03 | Borrado | **Con diálogo de confirmación** nombrando el producto. En la base el borrado es lógico (`deletedAt`), pero **el backend no expone ninguna forma de restaurar**: para el usuario es irreversible, y se trata como tal |
| 2026-09-03 | ¿E2E? | **SÍ, el camino completo**: login → `/inventario` → alta → el producto aparece en la lista, más el rechazo de un no-Administrador. Cierra el diferimiento que QC-20 dejó apuntando aquí. Los motivos por los que QC-11 y QC-12 lo difirieron **ya no aplican**: hay sesión real (QC-8, QC-9 `done`) e infraestructura de Playwright montada (4 specs) |
| 2026-09-03 | ¿Se muestra quién creó o modificó? | **NO.** QC-20 guarda ids, no nombres (D20, R8), y resolverlos exige consultar el contrato público de `identity` — trabajo nuevo que la ficha del board no pide. El dato queda guardado para quien lo necesite |
| 2026-09-03 | Route group | **`app/(private)/`**, heredado de la decisión humana de QC-11 (**D1**), que se aparta del `(dashboard)` de `docs/architecture.md`. **No es desviación a reportar** |
| 2026-09-03 | Componentes de ruta | En `<ruta>/components/` con barrel `index.ts`, heredado de QC-12: «la consistencia vale más que ahorrar una carpeta» |
| 2026-09-03 | Mutaciones | **Server Actions**, heredado de QC-11. Prohibido `fetch` a API routes propias |
| 2026-09-03 | Librería de componentes | **shadcn/ui por CLI.** Ningún primitivo se escribe ni se edita a mano en `components/ui/` (QC-11). Los que faltan (`table`, `sheet`, `select`, `alert-dialog`, `form`) se añaden con `pnpm dlx shadcn@latest add`. Si hiciera falta una **librería** de verdad, el `frontend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`) |
| 2026-09-03 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (QC-11, `docs/checkpoints-proyecto.md > Permisos`) |
| 2026-09-03 | Rutas y asserts | Rutas siempre en constantes exportadas, nunca literales (QC-11 R13). Los tests afirman sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy |
| 2026-09-03 | Multiplataforma | Se valida contra angosto y ancho con el helper `tests/helpers/viewport.ts` de QC-11. **No se declara ninguna excepción de escritorio** |
| 2026-09-03 | Base de shadcn/ui, Vitest, layout y sidebar | **Precondición heredada y montada.** No se re-crean. El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la T0 de `specs/11-*/tasks.md` existe para que no se repita |
