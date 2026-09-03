# QC-25 — crud-de-recetas · requirements.md

> **Zona:** `backend` · **Complejidad:** `high` · **depends_on:** `QC-24`, `QC-20`, `QC-8` ·
> **Rama:** `feature/QC-25-crud-de-recetas`
>
> **Alcance.** Los casos de uso del catálogo de recetas, sobre el modelo que crea QC-24: alta,
> consulta paginada, detalle, edición y borrado, con las líneas de producto conciliadas junto
> con la receta que las contiene. Incluye la autorización en el service, la validación de borde
> con zod, la **subida de la imagen a Supabase Storage detrás de un puerto**, las variables de
> entorno declaradas y vacías en `.env.example` y documentadas, y las Server Actions que
> consumirá QC-26. Reutiliza el util de paginación que extrajo QC-20; no lo duplica.
>
> **Lo que NO entra.** La pantalla: **QC-26 — Pantalla de recetas**. La migración de la unidad
> de línea de texto libre a catálogo: **QC-32 — Modelo de unidades**, que ya está acotada
> contando con que aquí sigue siendo texto. Tampoco entran el historial de versiones de fórmula,
> el rendimiento o producto resultante de una receta, la limpieza de archivos huérfanos del
> bucket, ni restaurar una receta borrada — los tres primeros son preguntas abiertas sin ficha,
> el último es decisión cerrada.
>
> Sembrado por `/afinar-feature` el 2026-09-03. El bloque de Alcance y la tabla de
> «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no los
> reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

No se rellenan con supuestos (regla 6 de `CLAUDE.md`). Ninguna bloquea el CRUD.

1. **¿Una receta produce algo?** Rendimiento, producto resultante, merma. Es pregunta de negocio
   y **no tiene ficha**. Si la respuesta llega, no es una columna: cambia el modelo (**QC-24**),
   no solo el CRUD.
2. **¿Hará falta historial de versiones de fórmula?** Heredada de **QC-24**, sigue abierta. El
   problema de retrofitearlo no es la tabla: para cuando alguien lo pida, las versiones
   anteriores ya se perdieron y no hay dato del que reconstruirlas.
3. **Los archivos huérfanos del bucket no los limpia nadie.** Consecuencia asumida de la decisión
   de que el archivo sobrevive al borrado de la receta, y no hay ficha de limpieza en el backlog.
   El día que moleste es ficha propia; hoy el bucket está vacío.
4. **La precisión `decimal(14,4)` de la cantidad.** Heredada de **QC-24**, sigue abierta: si una
   fórmula real necesita microgramos de un catalizador, se queda corta, y ampliarla con recetas
   ya cargadas obliga a migrar.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
| --- | --- | --- |
| 2026-09-03 | ¿Quién puede hacer qué? | **Solo Administrador**, y para todo: consultar, crear, editar y borrar. El Operador **ni siquiera consulta**. Se valida en el **service** con su test — una policy de RLS no cuenta como implementado (`docs/architecture.md > Acceso a datos y autorizacion`). Heredado de **QC-20 D2**, y ya lo anticipaba **QC-24 D18** |
| 2026-09-03 | ¿Qué significa borrar una receta? | **Lógico y sin restaurar**: se marca `deleted_at` y toda consulta la excluye. Sin papelera y sin operación de restaurar. Heredado de **QC-4**, **QC-20 D5** y **QC-24** |
| 2026-09-03 | Al borrar la receta, ¿se borra su imagen del Storage? | **No: el archivo sobrevive.** La fila sigue existiendo con su dirección, y borrar el archivo dejaría un registro vivo apuntando a nada — irreversible. Genera huérfanos a conciencia (pregunta abierta 3) |
| 2026-09-03 | Al reemplazar la imagen de una receta viva, ¿se borra la anterior? | **Sí.** Ya no la referencia nadie, y si no el bucket crece solo. Es el **único** borrado de Storage de esta ficha |
| 2026-09-03 | ¿El bucket es público o privado? | **Público.** QC-26 pone la URL en un `<img>` y no pide nada más. **La consecuencia se acepta con los ojos abiertos:** la imagen de una fórmula queda visible para cualquiera que tenga el enlace, sin sesión, y eso **no se revierte** cambiando el bucket después, porque las URLs ya circularon. Se descartó el bucket privado con enlace firmado y temporal, que era la recomendación |
| 2026-09-03 | ¿Qué se guarda en la columna de la imagen? | **La ruta dentro del bucket** (`recetas/<uuid>.jpg`), no la URL completa. La URL se compone al leer, juntando la dirección del proyecto —que ya es variable de entorno— con esa ruta. Cambiar de proyecto o de bucket no obliga a migrar ninguna fila |
| 2026-09-03 | Límites de la imagen | **Hasta 5 MB**, y **solo JPEG, PNG o WebP**. Se valida por el **contenido** del archivo, no solo por su extensión. Se rechazan PDF, SVG y HEIC |
| 2026-09-03 | ¿Guardar una receta sin imagen falla? | **Nunca.** La imagen es opcional, como fijó **QC-24**, y esta ficha no lo endurece |
| 2026-09-03 | Librería nueva (regla 7 de `CLAUDE.md`) | **`@supabase/storage-js`, y solo ese sub-paquete.** No entra `@supabase/supabase-js`: sin cliente de datos en el repo, el anti-patrón que prohíbe `CHECKPOINTS.md > Datos y seguridad` —leer o escribir datos de negocio con Supabase en vez de por Prisma— es **estructuralmente imposible**, no una promesa que alguien tenga que recordar. Mismo criterio con el que **QC-19** instaló solo el diccionario y no `zxcvbn` entero. **Los cuatro checks PASAN**, verificados contra el registro de npm el 2026-09-03: sin `deprecated`; publicado el **2026-09-02**; **25.309.308** descargas semanales; licencia **MIT**. Aprobada por el humano al acotar; su fila en `docs/dependencias.md` la añade el leader en **F1.4** |
| 2026-09-03 | ¿Dónde vive la subida? | **Detrás de un puerto del módulo `recetas`**, con su adaptador driven. El caso de uso no conoce Supabase. Un doble en los tests hace que la suite no necesite red ni bucket |
| 2026-09-03 | Configuración del Storage | Esta ficha **la deja utilizable**: las variables que necesita, **declaradas y vacías** en `.env.example` y documentadas. Ningún secreto hardcodeado (`CHECKPOINTS.md > Configuracion`) |
| 2026-09-03 | Forma de la consulta | **Paginada, 10 por página por defecto, tope superior 25**, orden `name ASC`. **Reutiliza** el util de paginación de `lib/shared/` que extrajo **QC-20 D16/D22**; duplicarlo sería exactamente el error que ese util existe para evitar |
| 2026-09-03 | ¿Hace falta desempate en el orden? | **No, y no por olvido.** El nombre de la receta **sí es único** (**QC-24**), así que `name ASC` ya es un orden total y la paginación es estable sin él. Se aparta de **QC-20 D20**, donde el desempate por `id` era obligatorio precisamente porque el nombre del producto no es único |
| 2026-09-03 | ¿El listado trae las líneas de producto? | **No.** El listado devuelve la receta sin líneas; **el detalle de una receta sí las trae**. Diez recetas de veinte ingredientes son doscientas filas para pintar una tabla que no las muestra |
| 2026-09-03 | ¿El listado devuelve el nombre del autor? | **No: solo los ids** de `created_by` y `updated_by`. Resolver el nombre es del contrato público de `identity` y es alcance de **QC-26**. Heredado de **QC-20 D21**. Y un autor vacío significa **«no la creó una persona»**, no un dato perdido (**QC-24**) |
| 2026-09-03 | ¿Cómo llegan los productos al editar? | **La lista final completa, y el servidor concilia** qué línea es nueva, cuál cambió y cuál desapareció. No hay operaciones sueltas por línea: la línea no existe separada de su receta. Quitar un producto **borra la línea de verdad**, sin `deleted_at` (**QC-24 D5**) |
| 2026-09-03 | ¿Qué se rechaza antes de guardar? | Nombre vacío o solo espacios (se recortan los extremos antes de guardar); nombre de más de **120**; descripción de más de **500**; nombre repetido comparado **normalizado** (sin acentos, sin caracteres especiales, sin distinguir mayúsculas); **nombre que al normalizar queda vacío** —un `«---»` no puede llegar al índice único y anunciarse al usuario como «ya existe», heredado de **QC-20 D22**—; cantidad negativa o cero; unidad vacía; producto repetido dentro de la misma receta; producto inexistente; y unos pasos que no sean una lista de textos o que traigan algún texto vacío |
| 2026-09-03 | Topes de los pasos | **Hasta 50 pasos, 1.000 caracteres cada uno.** Es validación de aplicación: la columna sigue guardando el documento JSON tal cual (**QC-24 D10**). El tope no lo alcanza ninguna receta real, pero impide que alguien mande un documento de megabytes a una columna sin límite |
| 2026-09-03 | La unidad de la línea, ¿sigue siendo texto libre? | **Sí, aquí sí.** No se adelanta el catálogo: **QC-32** ya está acotada para migrar `products.unit` y la unidad de la línea a FK, y **su ficha cuenta explícitamente con que esta las deja como texto**. Cuando QC-32 llegue, la validación «unidad vacía» de aquí se sustituye por «la unidad existe en el catálogo» |
| 2026-09-03 | ¿Se puede borrar un producto que alguna receta usa? | **Sí, sigue permitido**, y la receta conserva su línea. El borrado de producto es lógico (**QC-20 D5**), así que la fila sigue existiendo y la línea sigue apuntando al mismo producto (**QC-24**) |
| 2026-09-03 | Módulo, capas y borde | Módulo **`recetas`**. Mutaciones por **Server Action** en `adapters/driving/`, no Route Handler (`docs/architecture.md > Server Actions vs Route Handlers`). Validación de entrada con **zod** en el borde (`docs/conventions.md`). El producto se conoce **por el contrato público de `inventario`** (`@/lib/modules/inventario`), nunca por su tabla, su modelo de Prisma ni su repositorio (**QC-24 D1**, **QC-15**). Identificadores de la DB en **inglés** (**QC-4**) |
| 2026-09-03 | ¿De dónde sale el usuario en sesión? | De **QC-8 — sesión actual**, que ya es bloqueante de esta ficha. El *service* recibe el actor y su rol **por parámetro**; quien lo resuelve es el adaptador driving. Heredado de **QC-20 D17** |
| 2026-09-03 | E2E | **Diferido con motivo**: esta ficha no tiene pantalla, así que no hay flujo navegable que visitar. Lo decide **QC-26**. Mismo criterio que **QC-20 D4** y **QC-24** |
