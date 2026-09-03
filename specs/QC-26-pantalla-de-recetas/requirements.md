# QC-26 — pantalla-de-recetas · requirements.md

> **Zona** `frontend` · **Complejidad** `high` · **depends_on** `QC-25` ·
> **Rama** `feature/QC-26-pantalla-de-recetas`
>
> **Alcance.** La pantalla del catálogo de recetas en **`/produccion/formulas`**, dentro del
> layout privado: la lista paginada, el alta y la edición **en página propia** —con sus líneas de
> producto, sus pasos ordenables y su imagen— y el borrado con confirmación. Solo la ve el
> Administrador, y esta ficha declara la **segunda regla ruta→rol del repo**. Las cinco
> operaciones de receta ya existen y las expone QC-25 como Server Actions. Incluye, **como
> excepción explícita a que esta ficha sea solo capa visual**, la única operación de solo lectura
> que falta en el módulo `unidades` para poder poblar el selector de unidad.
>
> **Lo que NO entra.** Crear, editar y borrar unidades: **QC-38 — CRUD de unidades**. Búsqueda y
> orden configurable: el backend no los soporta y meterlos sería reabrir QC-25, que ya está
> `done`; **no tienen ficha y esta acotación no la crea**. El nombre de quien creó o modificó una
> receta: el backend guarda ids, no nombres (QC-25). Y nada más de backend: esta ficha no abre
> `lib/modules/recetas/` salvo para consumir su contrato público.
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de «Decisiones
> cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los
> reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea la pantalla.

1. **¿«Fórmulas» y «Recetas» acabarán siendo cosas distintas?** Hoy se decide que son lo mismo y
   esta pantalla ocupa el ítem del sidebar. Si algún día la fórmula pasa a ser *la versión
   concreta con la que se produjo un lote*, esta pantalla tendrá que ceder ese ítem. **Hoy no hay
   ficha de lotes que lo obligue**, y el ítem «Lotes» del sidebar sigue siendo placeholder.
2. **La búsqueda seguirá faltando mientras el backend no la soporte.** Ni recetas ni productos se
   pueden buscar: solo paginar. Con catálogos pequeños el selector paginado funciona; con cientos
   de productos se vuelve incómodo. Es **la misma deuda que dejó QC-22** y sigue sin ficha.
3. **`dnd-kit` no se publica desde diciembre de 2024.** Entra como excepción aprobada (ver la
   tabla), pero el riesgo que el check 2 vigila es real: es una librería que toca eventos de
   puntero y accesibilidad, y una versión de React que rompa algo la encontraría sin mantenedor
   activo. Si eso pasa, la salida ya está identificada:
   `@atlaskit/pragmatic-drag-and-drop`, que hoy pasa los cuatro checks.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | URL de la pantalla | **`/produccion/formulas`**, el ítem placeholder que QC-11 dejó apuntando a 404 (D2). Deja de ser placeholder, y **su etiqueta pasa de «Fórmulas» a «Recetas»**: una receta de un producto químico *es* su fórmula, y el board llamó **Recetas** a la épica, así que el menú habla el mismo idioma que el resto del sistema. **No se inventa una URL nueva**, exactamente como hizo **QC-22** con `/inventario` |
| 2026-09-03 | ¿Dónde vive la constante de ruta? | **En un solo sitio y reutilizada.** `FORMULAS_ROUTE` vive hoy en `lib/shared/navigation/private-nav.ts` como placeholder; al volverse real la necesitan **el middleware y la regla ruta→rol**, que **no pueden depender de la navegación** —arrastra etiquetas, iconos y agrupación de UI—. Se mueve a `lib/shared/routes.ts` **con reexport de compatibilidad**, que es literalmente lo que QC-22 hizo con `INVENTORY_ROUTE` y dejó escrito allí. Y hay que añadirla a `PRIVATE_ROUTE_PREFIXES` |
| 2026-09-03 | Alta y edición: ¿panel lateral o página? | **Página propia**, y se aparta de **QC-22** (que usó un `sheet`) **por tamaño, no por gusto**: el formulario tiene cuatro bloques —datos, líneas de producto, pasos e imagen— más un reordenable por arrastre, y eso en una columna estrecha es incómodo en escritorio e inusable en móvil. Además la URL pasa a identificar qué receta se está editando, así que el enlace se puede compartir |
| 2026-09-03 | El selector de unidad no tiene de dónde leer | **Esta ficha añade la lectura del catálogo de unidades, y SOLO la lectura.** QC-32 creó la tabla `units` y sembró cuatro filas (mililitro, litro, gramo, kilogramo) pero **no expuso ninguna forma de consultarlas**, y sin eso **ninguna línea de receta se puede guardar**: la pantalla entera quedaría muerta. Es backend dentro de una ficha `frontend`, **a conciencia y con precedente**: QC-22 se trajo el alta de presentaciones por el mismo motivo. **Crear, editar y borrar unidades sigue siendo de QC-38** y no se toca |
| 2026-09-03 | ¿Cómo se elige el producto de una línea? | **Selector paginado, con las páginas que el backend ya da** (25 por página, que es el tope de `MAX_PAGE_SIZE`), pudiendo pasar de página dentro del propio desplegable. **Se descartó filtrar en el cliente**: solo encontraría lo ya descargado, de modo que un producto de la página 4 no aparecería ni escribiendo su nombre exacto — es la mentira que **QC-22 rechazó por escrito** |
| 2026-09-03 | ¿Cómo se reordenan los pasos? | **Arrastrando y soltando**, con **equivalente por teclado obligatorio**. No es opcional: arrastrar no es alcanzable sin ratón, y la regla multiplataforma de `docs/architecture.md` prohíbe que algo dependa solo del mouse. Se descartó «arrastrar ahora, teclado después», que habría dejado la pantalla inutilizable sin ratón y una deuda de accesibilidad sin ficha |
| 2026-09-03 | Librería nueva (regla 7 de `CLAUDE.md`) | **`dnd-kit` entra como `excepcion`, NO como `aprobada`.** **Falla el check 2 — release en los últimos 12 meses**: `@dnd-kit/core` publicó por última vez el **2024-12-05** (21 meses) y `@dnd-kit/utilities` el **2023-11-06** (34 meses). **Pasa los otros tres**: sin `deprecated`, licencia **MIT**, **24.862.894** descargas semanales. Se ofreció **`@atlaskit/pragmatic-drag-and-drop`**, que **sí pasa los cuatro** (Apache-2.0, publicada el 2026-08-29, 1.343.967 descargas/semana), y el humano prefirió dnd-kit por su API de listas ordenables. **Aprobado explícitamente el 2026-09-03**; su fila en `docs/dependencias.md` **debe decir qué check falló y por qué se aceptó**, sin lo cual la fila no vale |
| 2026-09-03 | ¿E2E? | **Sí, el camino completo**: login → la pantalla → alta con una línea de producto y un paso → la receta aparece en la lista, **más el rechazo de un no-Administrador**. **Sin la subida de imagen**: exigiría un bucket real y red, y el gate corre sin red a propósito — convertiría el E2E en una prueba de infraestructura ajena. Cierra el diferimiento que **QC-25** dejó apuntando aquí |
| 2026-09-03 | Protección de la ruta | **Entra en esta ficha**, con su regla ruta→rol y su test. Es la **segunda** del repo, tras la que declaró QC-22. El guard `tests/guards/guard-rutas-privadas-cubiertas.test.ts` **pone el gate en rojo** si aparece una pantalla bajo `app/(private)/` sin prefijo que la cubra, así que no es opcional |
| 2026-09-03 | Autorización sobre los datos | **No la aporta la regla ruta→rol**, y esto ya lo advirtió QC-9 (R29): que una regla deje pasar no autoriza nada. Los cinco casos de uso de `recetas` ya llaman a `requireAdmin` como primera línea (QC-25). La pantalla **no repite la decisión ni la sustituye** |
| 2026-09-03 | Tamaño de página | **Selector de 10 y 25**, heredado de **QC-22**. Sin trabajo de backend: en `recetas` el defecto es 10, el tope 25, y el util de paginación **acota** por encima en vez de rechazar |
| 2026-09-03 | Borrado | **Con diálogo de confirmación nombrando la receta.** En la base es lógico (`deletedAt`), pero **el backend no expone forma de restaurar**: para el usuario es irreversible y se trata como tal. Heredado de **QC-22** |
| 2026-09-03 | Aviso de éxito y de error | **Toast para el éxito, error en línea junto al campo.** El `<Toaster />` **ya lo montó QC-22** en el layout privado, así que aquí **solo se usa**: no se monta otro |
| 2026-09-03 | ¿Se muestra quién creó o modificó la receta? | **No.** QC-25 devuelve **ids**, no nombres, y resolverlos exigiría consultar el contrato de `identity` — trabajo que la ficha no pide. Heredado de **QC-22**, misma decisión y mismo motivo |
| 2026-09-03 | Lo que se hereda del backend y no se re-decide | El **listado no trae las líneas** y el detalle sí; la edición manda **la lista final completa** y el servidor concilia; la imagen se guarda como **ruta** y la URL pública se compone al leer; **quitar la imagen borra el archivo** y el fallo de ese borrado **no revierte** la edición; la unidad es **referencia al catálogo**, no texto libre; la cantidad viaja **como cadena decimal**, nunca como número de coma flotante |
| 2026-09-03 | Route group, componentes, mutaciones y shadcn | **Heredado sin reabrir**: `app/(private)/` (QC-11 D1); componentes de ruta en `<ruta>/components/` con barrel `index.ts` (QC-12); mutaciones por **Server Action**, nunca `fetch` a API propia (QC-11); primitivas de **shadcn/ui por CLI**, ninguna escrita a mano en `components/ui/` — y si hiciera falta otra **librería**, el `frontend_dev` **para y la propone** (regla 7) |
| 2026-09-03 | Sesión, rutas y asserts | **Datos de sesión por props**, nunca fetcheados por el componente privado (`CHECKPOINTS.md > Permisos`). Rutas siempre en **constantes exportadas**, nunca literales (QC-11 R13). Los tests afirman sobre **roles ARIA, `data-testid` y constantes**, nunca sobre literales de copy |
| 2026-09-03 | Multiplataforma | Se valida en **angosto y ancho** con el helper `tests/helpers/viewport.ts` de QC-11, y **no se declara ninguna excepción de escritorio**. Aplica con fuerza a dos sitios de esta ficha: el **arrastre de pasos**, que necesita su equivalente por teclado, y cualquier **scroll horizontal**, que va contenido en su tabla y **nunca en el `body`** |
| 2026-09-03 | Base heredada | **shadcn/ui, Vitest, Playwright, el layout privado y el sidebar están montados y no se re-crean.** El choque entre las features 4 y 10 ya ocurrió una vez en este repo; la T0 de `specs/11-*/tasks.md` existe para que no se repita |
