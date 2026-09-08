# QC-39 — pantalla-de-unidades · requirements.md

> **Zona** `frontend` · **Complejidad** `medium` · **depends_on** QC-38 · **Rama**
> `feature/QC-39-pantalla-de-unidades`
>
> **Alcance.** El catálogo de unidades de medida en **`configuracion/unidades`**, añadiendo su ítem
> a la sección **Configuración** que **QC-45 ya creó**: la lista con búsqueda y orden por nombre, el
> alta y la edición en panel lateral, y el borrado con confirmación. Las tres operaciones de
> escritura **ya existen** como Server Actions de QC-38. **Esta ficha amplía además lo que devuelve
> la consulta** —la unidad de la que deriva, el factor y si es de sistema—, que hoy no viaja y sin
> lo cual la lista no puede pintar lo que se le pide.
>
> **Lo que NO entra.** Los casos de uso de escritura → **QC-38**, ya construidos: esta ficha los
> consume y no los reescribe. El esquema, la equivalencia y el ámbito por empresa → **QC-76**. La
> sección Configuración y el mecanismo de menú por permisos → **QC-45** y **QC-75**. Migrar las
> listas de productos y recetas a la tabla compartida → **QC-56**. Estrenar la **conversión** entre
> unidades en inventario, recetas o pedidos → **la ficha que se lo plantee**: aquí la unidad sigue
> siendo anotativa y la equivalencia solo se **muestra**.
>
> *Sembrado por `/afinar-feature` el 2026-09-08. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.*

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-08 | ¿Dónde vive la pantalla? | **`configuracion/unidades`**, como ítem de la sección **Configuración**. Cerrado al acotar **QC-76** y confirmado al acotar **QC-45** |
| 2026-09-08 | ¿Quién crea la sección Configuración? | **QC-45, y ya está hecha.** Esta ficha **solo añade su ítem** a una sección que existe. La corrección se escribió en este mismo issue el 2026-09-07 |
| 2026-09-08 | La lista tiene que mostrar la equivalencia y saber si la unidad es de sistema, pero el catálogo devuelve hoy solo nombre y símbolo. ¿Quién amplía la lectura? | **Esta ficha.** `UnitRef` es hoy `id`, `name` y `symbol`, y `UNIT_SELECT` proyecta exactamente esos tres: ni `baseUnitId`, ni `factor`, ni `companyId`. Se amplían la proyección y el tipo de lectura. **Cumple el encargo que QC-38 dejó escrito** en `unit-actions.ts`: «quien abre la puerta al contrato aquí es QC-39» |
| 2026-09-08 | ¿Eso convierte la ficha en `fullstack` y hay que partirla en dos? | **No: sigue siendo `frontend`.** Es proyección y tipo de lectura, no lógica de negocio nueva —el caso de uso, el repositorio y la autorización ya existen—. Partirla dejaría la pantalla bloqueada otra vez el día después de desbloquearse. Anotado en el issue para que no sea una sorpresa en la revisión |
| 2026-09-08 | ¿Qué permiso corta la pantalla? | **Los dos: `unidades.consultar` y `unidades.modificar`**, y el ítem del menú declara lo mismo que la página. La lista exige `consultar` en el service (`list-units.ts`) y las tres acciones exigen `modificar`. **QC-74 decidió que `modificar` NO implica `consultar`**: cortar solo por `modificar` dejaría a alguien con ese permiso viendo el enlace y recibiendo un fallo al cargar la lista. Hoy solo el Administrador tiene ambos, así que la garantía de QC-32 y QC-38 —«solo el Administrador consulta unidades»— se mantiene. **No se crea ningún permiso nuevo** ni se toca el catálogo de QC-74 |
| 2026-09-08 | ¿Búsqueda, orden y paginación? | **Sí, las tres**, como la pantalla hermana de presentaciones. Obliga a **abrir el parámetro de `listUnitsAction`**, que hoy no acepta ninguno. El soporte ya está hecho: `UNIT_QUERYABLE` y `sanitizeListQuery` vienen de **QC-57** |
| 2026-09-08 | ¿Por dónde busca el buscador? | **Solo por nombre**, normalizado —sin acentos ni distinguir mayúsculas—. **No busca por símbolo**: el adaptador compara contra `nameNormalized` y nada más. Derivado del código, no de una preferencia |
| 2026-09-08 | ¿Por qué campos se ordena? | **Nombre, símbolo y fecha de creación**, que es lo que `UNIT_QUERYABLE.sortable` ya declara. **No se ordena por equivalencia**, que no está ahí. El desempate estable por identificador ya lo pone el adaptador |
| 2026-09-08 | ¿Filtros? | **Ninguno.** `UNIT_QUERYABLE.filterable` está vacío **a propósito**, y su propio comentario lo dice: es la lista blanca declarando que aquí no se filtra |
| 2026-09-08 | ¿Qué columnas tiene la lista? | **Nombre, Símbolo, Equivalencia y las acciones de fila.** **Sin columna de Ámbito**: que una unidad sea de sistema o de la empresa es **manejo interno** y no se le muestra al usuario. Esto **corrige** lo que la ficha del board pedía el 2026-09-07 |
| 2026-09-08 | ¿Cómo se pinta la equivalencia? | **Como frase ya armada**: «1 kg = 1000 gr», que es el ejemplo literal del board. Una unidad **base** muestra un guion. El factor viaja y se pinta como **texto decimal, nunca `number`** —así lo declara `UnitConversion`—, y su significado es «cuántas unidades de la apuntada caben en una de ésta» |
| 2026-09-08 | ¿Qué ve el usuario en la fila de una unidad de sistema? | **La celda de acciones vacía, y nada más.** No se ofrece lo que el service rechaza, y no se explica por qué: sin etiqueta, sin botones apagados y sin distintivo junto al nombre. La distinción queda implícita, que es lo coherente con tratarla como manejo interno |
| 2026-09-08 | ¿Se puede editar o borrar una unidad de sistema? | **No**, y la pantalla **no repite la decisión**: la rechaza el service, con su test, desde **QC-38** y **QC-76**. Ocultar los botones es comodidad de la interfaz, no el control |
| 2026-09-08 | Alta y edición: ¿modal o página? | **Panel lateral (`sheet` de shadcn/ui)**, heredado de **QC-45** y **QC-22**: al guardar se vuelve a la lista sin perder la página, la búsqueda ni el orden en los que estabas |
| 2026-09-08 | ¿Qué campos tiene el formulario? | **Los cuatro**: nombre, símbolo, de qué unidad deriva y factor. La edición es **reemplazo completo** de los cuatro, heredado de **QC-38**: con envío parcial no se distingue «no lo toques» de «bórralo», y aquí hay dos campos que se pueden vaciar |
| 2026-09-08 | ¿Qué ofrece el selector de «deriva de»? | **Solo unidades base.** La derivación es de **un solo nivel** y el service rechaza apuntar a una derivada o a sí misma (**QC-38**, **QC-76**). La pantalla no vuelve a validarlo: lo ofrece bien y deja que el error de dominio mande |
| 2026-09-08 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo**, heredado de **QC-45** y **QC-22**. El `<Toaster />` lo monta el layout privado desde **QC-11**: aquí no se vuelve a montar |
| 2026-09-08 | Borrado | **Con diálogo de confirmación nombrando la unidad**, heredado de **QC-45** y **QC-22** |
| 2026-09-08 | ¿Y si la unidad está en uso? | **Se rechaza y el error se pinta en el diálogo.** El borrado es **físico** y lo bloquea `ON DELETE RESTRICT`: ni si la usa un producto o una línea de receta, **ni si otra unidad deriva de ella** (**QC-32 D10**, **QC-76**, **QC-38**) |
| 2026-09-08 | ¿Cómo se distinguen los errores? | Por su **`code` estable**, nunca por el texto. Es lo que ya hace `unit-actions.ts` (`docs/conventions.md > Manejo de errores`) |
| 2026-09-08 | Estado vacío | Es el de **«la búsqueda no encontró nada»**, y **no** ofrece «crea la primera»: con las unidades de sistema siempre presentes, la lista nunca sale vacía de verdad. Se aparta aquí de **QC-45** con motivo |
| 2026-09-08 | Estados de la lista | **Vacío, cargando y error**, los tres, con el reparto de **QC-45**: la sección pide los datos, los componentes los pintan |
| 2026-09-08 | Tamaño de página | **Selector de 10 y 25**, heredado de **QC-45** y **QC-22** |
| 2026-09-08 | ¿La lista usa la tabla compartida? | **Sí**, la de **QC-55**, por su barrel público y sin tocar ni un archivo suyo. Las acciones de fila van como **columna normal con `pinnable: false`**: **QC-45 resolvió la pregunta abierta 4 de QC-55** y esta ficha **hereda la respuesta sin volver a decidirla** |
| 2026-09-08 | Protección de la ruta | **Dos controles distintos, y ninguno sustituye al otro**: `PRIVATE_ROUTE_PREFIXES` cubre la ruta —eso garantiza **sesión**, en el borde, y su guardia pone el gate en rojo si una pantalla privada se queda sin prefijo—, y la página exige el **permiso** con `requirePagePermission(...)` **antes de leer datos**. Quien tiene sesión pero no permiso recibe **404 dentro del layout privado** (**QC-75**, **QC-45**) |
| 2026-09-08 | ¿Dónde vive la constante de ruta? | **En un solo sitio, reutilizada** por el ítem del menú, la lista de prefijos y cualquier destino de la propia pantalla. Nunca un literal (**QC-11 R13**, **QC-45 R2**) |
| 2026-09-08 | Route group y componentes | **`app/(private)/`**, y los componentes en `<ruta>/components/` con barrel `index.ts`, importados por el barrel y nunca por ruta profunda (**QC-12**, **QC-45**) |
| 2026-09-08 | Mutaciones | **Server Actions**, las tres que **QC-38** ya expone. Prohibido `fetch` a una ruta del propio origen (**QC-11**, `docs/architecture.md > Server Actions vs Route Handlers`) |
| 2026-09-08 | ¿Dónde se valida la autorización? | **En el service**, que es donde ya está: los casos de uso de **QC-38** exigen el permiso con su test. La pantalla **no la repite ni la sustituye** (**QC-20 D2**, `CHECKPOINTS.md > Permisos`) |
| 2026-09-08 | Datos de sesión | **Por props**, nunca fetcheados por el componente privado (**QC-11**, `CHECKPOINTS.md > Permisos`) |
| 2026-09-08 | Librería de componentes | **shadcn/ui por CLI.** Ningún primitivo se escribe ni se edita a mano en `components/ui/` (**QC-11**). Si hiciera falta una librería de verdad, el `frontend_dev` **para y la propone**; no la instala (regla 7 de `CLAUDE.md`) |
| 2026-09-08 | Asserts de los tests | Sobre **roles ARIA, `data-testid` y constantes exportadas**; **nunca** sobre literales de copy (**QC-11**, **QC-22**, **QC-45**) |
| 2026-09-08 | Multiplataforma | Se valida contra angosto y ancho con `tests/helpers/viewport.ts`. **Ninguna excepción de escritorio.** El desbordamiento se resuelve con scroll horizontal **contenido en la tabla**, nunca del `body`. La columna de equivalencia entra en esa cuenta: es la que más ancho pide |
| 2026-09-08 | ¿E2E? | **Sí, ligera**: login → la pantalla → crear una unidad **derivada** → verla en la lista **con su equivalencia armada**, más el **rechazo de quien no tiene el permiso**. `CHECKPOINTS.md` lo pide cuando hay permisos, Playwright ya está montado, y **cierra el diferimiento que QC-38 dejó apuntando a esta ficha** |
| 2026-09-08 | Base heredada | **shadcn/ui, Vitest, Playwright, layout privado, sidebar, `<Toaster />`, la tabla compartida de QC-55, la sección Configuración de QC-45 y el menú por permisos de QC-75 están montados y NO se re-crean.** La T0 de `specs/11-*/tasks.md` existe justo por esto |
| 2026-09-08 | Librería nueva | **Ninguna.** Todo lo que hace falta está aprobado y montado |
