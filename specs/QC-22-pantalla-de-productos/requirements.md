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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

**P1 — Qué pasa con `/inventario` cuando llegue QC-45.** Hoy `/inventario` **es** la pantalla de
productos y el ítem del sidebar apunta ahí directo. Cuando entre la pantalla de presentaciones
habrá que decidir si `/inventario` pasa a ser un submenú con dos entradas
(`/inventario/productos` y `/inventario/presentaciones`) o si presentaciones cuelga de otra URL.
**Fuera del alcance de QC-22** y no se rellena con un supuesto (regla 6 de `CLAUDE.md`): lo
decide QC-45 al acotarse. Esta ficha deja la constante de ruta en un solo sitio justamente para
que ese cambio sea barato.

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
| 2026-09-03 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (QC-11, `CHECKPOINTS.md > Permisos`) |
| 2026-09-03 | Rutas y asserts | Rutas siempre en constantes exportadas, nunca literales (QC-11 R13). Los tests afirman sobre roles ARIA, `data-testid` y constantes exportadas; **nunca** sobre literales de copy |
| 2026-09-03 | Multiplataforma | Se valida contra angosto y ancho con el helper `tests/helpers/viewport.ts` de QC-11. **No se declara ninguna excepción de escritorio** |
| 2026-09-03 | Base de shadcn/ui, Vitest, layout y sidebar | **Precondición heredada y montada.** No se re-crean. El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la T0 de `specs/11-*/tasks.md` existe para que no se repita |
