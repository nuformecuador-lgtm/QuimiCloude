# QC-25 — crud-de-recetas · tasks.md

> Zona: `backend` · Complejidad: `high` · Rama: `feature/QC-25-crud-de-recetas`
>
> El **qué** está en `requirements.md` (R1–R49); el **cómo**, en `design.md`. Aquí está el
> desglose ejecutable. `[P]` marca lo que puede ir en paralelo con otra task del mismo grupo.
> Cada task tiene su criterio de «hecho»: si no se puede comprobar, no está hecha.
>
> **Antes de empezar:** el spec tiene que estar **aprobado** por el humano (F1.4). Las **preguntas
> 5, 6 y 7** que abrió el diseño **ya están cerradas** —son las tres últimas filas de
> `requirements.md > Decisiones cerradas (no reabrir)` y sus requisitos son **R45–R49**—: se puede
> quitar la imagen sin poner otra **y ese archivo se borra**, el fallo de un borrado **no** revierte
> la edición, y al editar se admite la línea que ya estaba aunque su producto esté de baja. La 5 se
> cerró **contra** la posición por defecto del diseño (`design.md > 13.1`, DESCARTADA); las otras
> dos la confirmaron. No queda ninguna abierta de esta ficha.
>
> **T0 es de disco, no de código, y va primero:** la fila de `@supabase/storage-js` en
> `docs/dependencias.md` la escribe **el leader** en F1.4. Mientras no exista,
> `tests/guards/guard-dependencias-aprobadas.test.ts` deja el gate en rojo en cuanto se instale la
> librería. Ese orden es el correcto y no se invierte (regla 7 de `CLAUDE.md`).
>
> Cierra cada tanda con `./init.sh --rapido`. **Antes del PR, `./init.sh` completo, sin
> excepción** (`docs/verification.md`).

---

## Grupo A — cimientos (sin dependencias entre sí)

- [ ] **T0 — Instalar la dependencia aprobada.** `pnpm add @supabase/storage-js`. **Solo** ese
      sub-paquete: `@supabase/supabase-js` no entra (D9, R42).
      *Depende de:* la fila en `docs/dependencias.md` que escribe el leader en F1.4.
      **Hecho cuando:** `tests/guards/guard-dependencias-aprobadas.test.ts` pasa y `package.json`
      no ganó ninguna otra dependencia.

- [ ] **T1 [P] — Dominio base del módulo.** `domain/actor.ts` (`Actor`, `ADMIN_ROLE_NAME`,
      `requireAdmin`), `domain/errors.ts` (`RecetasError`, `UnauthorizedError`, `NotFoundError`,
      `DuplicateNameError`, `ValidationError`), `domain/page.ts` (`Page<T>`, `PageQuery`,
      `pageQuerySchema`). `domain/recipe-name.ts` ya existe (QC-24) y **no se toca**.
      **Hecho cuando:** `pnpm run typecheck` limpio y `domain/` no importa framework, Prisma,
      `lib/shared/` ni `composition`.

- [ ] **T2 [P] — Detección de formato y límites de la imagen.** `domain/recipe-image.ts`: función
      pura que rechaza por tamaño (5 MB) y detecta JPEG/PNG/WebP **por los bytes**, devolviendo el
      `contentType` y la extensión derivados (`design.md > 9.2`).
      **Hecho cuando:** `tests/unit/recetas/recipe-image.test.ts` pasa con la tabla de firmas
      —los tres aceptados y PDF, SVG y HEIC renombrados a `.jpg` rechazados— y el corte de 5 MB.

- [ ] **T3 [P] — Test de alcance, adelantado.** `tests/unit/recetas/scope.test.ts`: no hay ruta,
      página ni componente de recetas bajo `app/`, ni route handler bajo `app/api/`, ni spec nuevo
      en `e2e/`; `recetas` no reimplementa la aritmética de paginación; ninguna columna, índice ni
      restricción nueva en `recipes` ni en `recipe_lines`; ningún test importa
      `@supabase/storage-js` ni el adaptador de Storage (R31, R41, R43, R44).
      **Hecho cuando:** pasa y **falla** si se añade cualquiera de esas cosas. Se adelanta a
      propósito: es mientras se llena `domain/` cuando el alcance se escapa (lección de QC-20 T15).

## Grupo B — casos de uso (depende de A)

- [ ] **T4 — Esquemas de entrada zod.** `domain/recipe-input.ts` (`design.md > 7.1`): trim, mínimo
      1 y máximo 120 en el nombre, 500 en la descripción, `refine` que rechaza el nombre que
      normaliza a vacío, cantidad decimal como **cadena** `> 0`, unidad no vacía, pasos (≤ 50, ≤
      1.000 cada uno, ninguno vacío) y `refine` de producto repetido.
      El campo `image` de la edición distingue **tres estados** —omitido, `{ bytes }` y `null`—
      con el significado de la tabla de `design.md > 7.1` (R47).
      *Depende de:* T1. **Hecho cuando:** `tests/unit/recetas/recipe-input.test.ts` pasa
      (R7, R9, R14, R15, R16, R19, R20, R30, R38) y el esquema **no** colapsa `undefined` y `null`
      del campo `image` en el mismo valor.

- [ ] **T5 — Tipos de salida y puertos.** `domain/recipe-view.ts` (`RecipeSummary`,
      `RecipeDetail`, `RecipeLineView`), `ports/recipe-repository.ts` y
      `ports/recipe-image-storage.ts` con los resultados discriminados de `design.md > 7.3` y `> 9.1`.
      *Depende de:* T1, T4. **Hecho cuando:** typecheck limpio y ningún import prohibido en
      `ports/`.

- [ ] **T6 — Los cinco casos de uso.** `create`, `get`, `list`, `update`, `delete`. `requireAdmin`
      en la **primera línea** de cada uno. Orden de operaciones de la imagen y `remove` solo al
      reemplazar (`design.md > 9.3`); validación de existencia del producto por `ProductCatalog`
      en una sola llamada (`design.md > 6`).
      *Depende de:* T5. **Hecho cuando:** `tests/unit/recetas/recipe-service.test.ts` pasa con
      dobles de los tres puertos (R5, R6, R11, R17, R18, R21, R22, R26, R27, R33, R34, R36, R37).

- [ ] **T7 [P] — Composición de la URL de lectura.** El caso de uso mapea `imagePath → imageUrl`
      a través de `publicUrl` del puerto; sin firma ni caducidad (D5, D6).
      *Depende de:* T6. **Hecho cuando:** `tests/unit/recetas/recipe-image-url.test.ts` pasa
      (R24, R25) y ningún caso de uso conoce el bucket.

- [ ] **T8 — Test de autorización de los cinco casos de uso.**
      `tests/unit/recetas/authorization.test.ts`, con dobles de repositorio, catálogo y
      almacenamiento que **fallan si los llaman** (`design.md > 14`, cuarto aviso).
      *Depende de:* T6. **Hecho cuando:** los cinco casos cubren Operador, rol nulo, rol
      desconocido y actor ausente, y cada uno afirma `not.toHaveBeenCalled()` sobre los tres
      puertos (R1, R2, R3).

> **T17 y T18 cierran las decisiones que el humano tomó en F1.4** (preguntas 5, 6 y 7). Van
> numeradas al final para no renumerar las tasks ya escritas, pero **se ejecutan aquí**, en el
> Grupo B, porque son comportamiento de los casos de uso.

- [ ] **T17 — Ciclo de vida de la imagen en la edición.** Los tres estados de `image`
      (`design.md > 7.1`, `> 9.3`): omitido conserva y no llama al almacenamiento; `{ bytes }` sube,
      persiste y borra la anterior; `null` deja `imagePath` en `NULL` y **borra** el archivo que
      tenía. Los dos borrados llaman al **mismo** `remove` del puerto —una sola implementación
      (R48)— y el fallo de `remove` **no** revierte la edición: se devuelve como advertencia con
      contexto, nunca un `catch` vacío (R49).
      *Depende de:* T6. **Hecho cuando:** `tests/unit/recetas/recipe-image-lifecycle.test.ts` pasa
      (R47, R48, R49), incluido el caso del doble cuyo `remove` **rechaza** y la edición resuelve
      igual con su advertencia.

- [ ] **T18 — Validación de producto solo para las líneas nuevas.** Diferencia de conjuntos de
      `design.md > 6`: `findRefs` se pide **solo** sobre los productos que no estaban ya en la
      receta; en el alta, sobre todos. La línea preexistente con producto dado de baja se admite
      (R45); añadir un producto inexistente o de baja se rechaza (R46). El `productName` del
      detalle se sigue pidiendo sobre **todas** las líneas y sale `null` para el de baja (R18).
      *Depende de:* T6, T9. **Hecho cuando:** `tests/unit/recetas/recipe-lines-catalog.test.ts`
      pasa y el doble del catálogo demuestra que **no se le pregunta** por la línea preexistente.

## Grupo C — adaptadores y cableado (depende de B)

- [ ] **T9 [P] — Implementación de `ProductCatalog` en `inventario`.**
      `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts`: `findRefs`
      devolviendo solo productos **vivos**, en una sola consulta.
      *Depende de:* T5. **Hecho cuando:** `tests/unit/inventario/product-catalog.test.ts` pasa y la
      guardia de módulos sigue verde —`recetas` no escribe `prisma.product` en ninguna parte—.

- [ ] **T10 [P] — Adaptador driven de persistencia.**
      `adapters/driven/persistence/recipe-prisma.ts`: filtro `deleted_at IS NULL`, escritura de
      `created_by`/`updated_by`, conversión `string ↔ Prisma.Decimal`, orden `name ASC` **sin
      desempate** (D13), uso de `lib/shared/pagination`, conciliación en una sola
      `prisma.$transaction` (`design.md > 8`) y traducción de SQLSTATE (`23505` → `'duplicate'`,
      `23514` → error de validación).
      *Depende de:* T5. **Hecho cuando:** typecheck limpio y es el único archivo del módulo que
      importa `@prisma/client`.

- [ ] **T11 [P] — Adaptador driven de Storage y su configuración.**
      `adapters/driven/storage/recipe-image-supabase.ts` (único archivo del repo que importa
      `@supabase/storage-js`) y `adapters/driven/config/storage-config-env.ts`, que lee las tres
      variables **en el momento de la invocación** y falla nombrándolas sin filtrar valores.
      Bloque nuevo y **vacío** en `.env.example` con su documentación. El adaptador expone **un
      solo** `remove(path)`, que es el que usan los dos caminos de borrado (R48): no se añade
      ningún `clearImage`, `deleteObject` ni equivalente (`design.md > 12.10`).
      *Depende de:* T0, T5. **Hecho cuando:** `tests/unit/recetas/storage-config.test.ts` pasa
      (R28), la suite entera sigue verde con las tres variables vacías (R43) y el adaptador tiene
      exactamente una operación de borrado.

- [ ] **T12 — Contrato y punto de composición.** `lib/modules/recetas/index.ts` reexporta tipos,
      esquemas, errores y las cinco factories —**solo** de `./domain`—; `lib/composition/index.ts`
      gana la fachada `recetas` con el repositorio, el `ProductCatalog` de `inventario` y el
      almacenamiento, sin tocar el cableado de `identity` ni el de `inventario`.
      *Depende de:* T6, T9, T10, T11. **Hecho cuando:** la guardia de módulos pasa y el contrato no
      arrastra `'use server'`, Prisma, `next/*` ni `@supabase/storage-js` en su cierre transitivo
      (R40).

- [ ] **T13 — Server Actions.** `adapters/driving/recipe-actions.ts`: `'use server'`, actor desde
      `identity.getSessionUser()` vía `@/lib/composition`, validación zod antes de llamar al caso
      de uso y errores traducidos a estado serializable para el formulario de QC-26. Las
      **advertencias de almacenamiento** que devuelve la edición (R49) se registran con su contexto
      aquí, no se descartan.
      *Depende de:* T12, T17. **Hecho cuando:** `tests/unit/recetas/recipe-actions.test.ts` pasa
      (R38, R39), no existe ningún route handler nuevo y una advertencia de borrado no convierte la
      edición en error para el llamante.

## Grupo D — verificación contra la base y cierre

- [ ] **T14 [P] — Tests de integración.** `tests/integration/recetas/recipe-crud.int.test.ts` y
      `recipe-lines.int.test.ts`, con `beforeAll` que falla claro si faltan las tablas de QC-24,
      cada caso en `$transaction` con `ROLLBACK` y afirmaciones sobre **SQLSTATE**.
      *Depende de:* T10. **Hecho cuando:** ambos pasan contra Postgres real y cubren R5, R10, R12,
      R13, R14, R16, R18, R29, R30, R32, R35, R36.

- [ ] **T15 [P] — Cierre del alcance.** Revisar que `tests/unit/recetas/scope.test.ts` (T3) sigue
      cubriendo sus cuatro cláusulas ahora que el módulo tiene contenido, y que ninguna guardia se
      relajó para que algo pasara.
      *Depende de:* T13. **Hecho cuando:** el test falla si se añade una pantalla, un route handler,
      una columna nueva o un import de Storage en un test.

- [ ] **T16 — Cierre.** `./init.sh` completo en verde,
      `progress/impl_QC-25-crud-de-recetas.md` con la salida real de los tests y el mapa
      `R<n> → test` de abajo, y todas las tasks marcadas `[x]`.
      *Depende de:* todas. **Hecho cuando:** `CHECKPOINTS.md` se cumple entero.

---

## Trazabilidad `R<n> → test`

Cada requisito con el archivo **y el nombre** del test que lo cierra. El reviewer rechaza si falta
uno (`CHECKPOINTS.md > Trazabilidad`).

| R | Archivo de test | Nombre del test |
| --- | --- | --- |
| R1 | `tests/unit/recetas/authorization.test.ts` | `cada caso de uso recibe el actor por parametro y no lee ninguna sesion` |
| R2 | `tests/unit/recetas/authorization.test.ts` | `un actor con rol Operador es rechazado en los cinco casos de uso sin llamar a ningun puerto` |
| R3 | `tests/unit/recetas/authorization.test.ts` | `un actor ausente, con rol nulo o con rol desconocido es rechazado igual que el Operador` |
| R4 | `tests/guards/guard-rls-force.test.ts` | `toda tabla creada en las migraciones tiene ENABLE y FORCE ROW LEVEL SECURITY` (ya existente) |
| R5 | `tests/integration/recetas/recipe-crud.int.test.ts` | `crea la receta con todas sus lineas y devuelve su identificador` |
| R6 | `tests/unit/recetas/recipe-service.test.ts` | `guarda al actor como autor de creacion y de modificacion al crear, y solo de modificacion al editar y al borrar` |
| R7 | `tests/unit/recetas/recipe-input.test.ts` | `rechaza el nombre vacio, el de mas de 120 y la descripcion de mas de 500, y recorta los extremos` |
| R8 | `tests/unit/recetas/recipe-service.test.ts` | `persiste el nombre normalizado junto al nombre y traduce el duplicado del puerto a error de nombre repetido` |
| R9 | `tests/unit/recetas/recipe-input.test.ts` | `rechaza como nombre invalido el que queda vacio al normalizarlo` |
| R10 | `tests/integration/recetas/recipe-crud.int.test.ts` | `el indice unico rechaza con SQLSTATE 23505 la segunda receta viva con el mismo nombre normalizado` |
| R11 | `tests/unit/recetas/recipe-service.test.ts` | `la edicion recibe la lista final completa y no expone ninguna operacion por linea` |
| R12 | `tests/integration/recetas/recipe-crud.int.test.ts` | `la linea que desaparece de la lista final se borra fisicamente` |
| R13 | `tests/integration/recetas/recipe-crud.int.test.ts` | `si falla una linea la edicion revierte entera y la receta queda como estaba` |
| R14 | `tests/unit/recetas/recipe-input.test.ts` + `tests/integration/recetas/recipe-lines.int.test.ts` | `rechaza la cantidad cero o negativa y la unidad vacia` + `el CHECK rechaza con SQLSTATE 23514 la cantidad no positiva` |
| R15 | `tests/unit/recetas/recipe-input.test.ts` | `acepta cualquier texto no vacio como unidad, sin catalogo` |
| R16 | `tests/unit/recetas/recipe-input.test.ts` + `tests/integration/recetas/recipe-lines.int.test.ts` | `rechaza dos lineas con el mismo producto` + `el unico (recipe_id, product_id) rechaza con SQLSTATE 23505` |
| R17 | `tests/unit/recetas/recipe-service.test.ts` + `tests/unit/inventario/product-catalog.test.ts` + `tests/guards/guard-arquitectura-modulos.test.ts` | `rechaza la linea cuyo producto no existe, consultando el contrato de inventario` + `findRefs devuelve solo los productos vivos` + `ningun modulo consulta un modelo ajeno con Prisma` (ya existente) |
| R18 | `tests/integration/recetas/recipe-lines.int.test.ts` | `la linea de un producto borrado logicamente se conserva y el detalle la devuelve` |
| R19 | `tests/unit/recetas/recipe-input.test.ts` | `rechaza unos pasos que no son lista de textos o que traen alguno vacio, y guarda lista vacia si no hay pasos` |
| R20 | `tests/unit/recetas/recipe-input.test.ts` | `rechaza mas de 50 pasos y el paso de mas de 1000 caracteres` |
| R21 | `tests/unit/recetas/recipe-service.test.ts` | `crea y edita la receta sin imagen sin llamar al almacenamiento` |
| R22 | `tests/unit/recetas/recipe-service.test.ts` + `tests/guards/guard-arquitectura-modulos.test.ts` | `sube la imagen a traves del puerto, con un doble en memoria` + `domain y ports no importan framework, base de datos, shared ni adaptadores` (ya existente) |
| R23 | `tests/unit/recetas/recipe-image.test.ts` | `acepta JPEG, PNG y WebP por su contenido y rechaza PDF, SVG y HEIC renombrados a .jpg, ademas del archivo de mas de 5 MB` |
| R24 | `tests/unit/recetas/recipe-image-url.test.ts` | `persiste la ruta dentro del bucket y compone la URL al leer` |
| R25 | `tests/unit/recetas/recipe-image-url.test.ts` | `la URL compuesta es publica, sin firma ni caducidad` |
| R26 | `tests/unit/recetas/recipe-service.test.ts` | `al reemplazar la imagen borra el archivo anterior despues de persistir la nueva ruta` |
| R27 | `tests/unit/recetas/recipe-service.test.ts` | `al borrar la receta no llama al almacenamiento y conserva la ruta` |
| R28 | `tests/unit/recetas/storage-config.test.ts` | `las tres variables estan declaradas y vacias en .env.example y el adaptador falla nombrandolas sin filtrar valores` |
| R29 | `tests/integration/recetas/recipe-crud.int.test.ts` | `devuelve como maximo el tamano de pagina pedido y el total de recetas` |
| R30 | `tests/unit/recetas/recipe-input.test.ts` + `tests/unit/pagination.test.ts` | `rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1` + `usa 10 por defecto y acota a 25` (ya existente, QC-20) |
| R31 | `tests/unit/recetas/scope.test.ts` + `tests/guards/guard-arquitectura-modulos.test.ts` | `el modulo recetas no reimplementa el calculo de paginacion` + `lib/shared no importa modulos ni composition` (ya existente) |
| R32 | `tests/integration/recetas/recipe-crud.int.test.ts` | `ordena por nombre ascendente y recorre las paginas sin repetir ni omitir ninguna receta` |
| R33 | `tests/unit/recetas/recipe-service.test.ts` | `la lista no trae lineas y el detalle si las trae con producto, cantidad y unidad` |
| R34 | `tests/unit/recetas/recipe-service.test.ts` | `devuelve los autores como identificadores y acepta la receta sin autor` |
| R35 | `tests/integration/recetas/recipe-crud.int.test.ts` | `al borrar conserva la fila y marca deleted_at` |
| R36 | `tests/integration/recetas/recipe-crud.int.test.ts` | `la lista y el detalle excluyen las recetas borradas` |
| R37 | `tests/unit/recetas/recipe-service.test.ts` | `devuelve no encontrado al consultar, editar o borrar una receta inexistente o ya borrada` |
| R38 | `tests/unit/recetas/recipe-actions.test.ts` | `la Server Action rechaza la entrada invalida antes de llamar al caso de uso` |
| R39 | `tests/unit/recetas/scope.test.ts` | `las mutaciones de recetas son Server Actions y no hay ningun route handler bajo app/api` |
| R40 | `tests/guards/guard-arquitectura-modulos.test.ts` | `domain y ports no importan framework, base de datos, shared ni adaptadores` + `el contrato solo reexporta de ./domain` (ya existente) |
| R41 | `tests/unit/recetas/scope.test.ts` | `esta feature no anade ninguna columna, indice ni restriccion a recipes ni a recipe_lines` |
| R42 | `tests/guards/guard-dependencias-aprobadas.test.ts` | `toda dependencia de package.json esta en docs/dependencias.md` (ya existente) |
| R43 | `tests/unit/recetas/scope.test.ts` | `ningun test importa @supabase/storage-js ni el adaptador de Storage` |
| R44 | `tests/unit/recetas/scope.test.ts` | `no existe ninguna pantalla, pagina ni componente de recetas, ni spec E2E nuevo` |
| R45 | `tests/unit/recetas/recipe-lines-catalog.test.ts` | `admite la linea que ya estaba aunque su producto este borrado logicamente, sin preguntar al catalogo por ella` |
| R46 | `tests/unit/recetas/recipe-lines-catalog.test.ts` | `rechaza la linea nueva cuyo producto no existe o esta de baja, y en el alta valida todas las lineas` |
| R47 | `tests/unit/recetas/recipe-image-lifecycle.test.ts` | `image nulo deja la receta sin ruta y borra el archivo; image omitido conserva la imagen sin tocar el almacenamiento` |
| R48 | `tests/unit/recetas/recipe-image-lifecycle.test.ts` | `reemplazar y quitar la imagen llaman al mismo remove del puerto, que es la unica operacion de borrado` |
| R49 | `tests/unit/recetas/recipe-image-lifecycle.test.ts` | `si el remove falla la edicion no se revierte y devuelve la advertencia con su contexto` |

**Guardias que no hay que escribir:** R4, R17 (parte), R22 (parte), R30 (parte), R31 (parte), R40 y
R42 los cierran guardias y tests que ya existen. Se citan porque un requisito sin test es un fallo
de la feature, no porque haya que tocarlas.
