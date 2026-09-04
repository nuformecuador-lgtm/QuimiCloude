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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**P1 — La línea tiene columna de imagen y nadie la llena.** Heredada de QC-52 (P1). La pantalla la
ignora por decisión de esta acotación, pero quién sube, dónde se guarda —el único flujo de subida
del repo es el de recetas, sobre Supabase Storage— y qué pasa al dar de baja una línea con imagen
sigue sin decidirse. No se rellena con un supuesto (regla 6 de `CLAUDE.md`).

**P2 — El mínimo de compra sigue sin decir en qué se mide.** Se lee según la unidad, que QC-32
dejó **opcional**: un mínimo de `2,5` sobre una línea sin unidad es ambiguo. Heredada de QC-42 (P4)
y de QC-52 (P3), y sigue abierta.

**P3 — QC-52 todavía se está implementando.** Esta ficha se especifica contra las decisiones
cerradas de su `requirements.md`, no contra código mergeado. SI al implementar QC-52 alguna de esas
decisiones cambia, el `frontend_dev` **para y lo reporta al leader**; no adapta la pantalla por su
cuenta.

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
