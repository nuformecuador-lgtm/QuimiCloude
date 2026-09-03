# Implementación QC-25 — crud-de-recetas

Backend dev. Alcance de esta tanda: **Grupo A — cimientos** (T0, T1, T2, T3) de
`specs/QC-25-crud-de-recetas/tasks.md`.

## T0 — Instalar la dependencia aprobada

- `pnpm add @supabase/storage-js` (solo ese sub-paquete; `@supabase/supabase-js` no entra).
- Archivos modificados: `package.json` (+1 dependencia), `pnpm-lock.yaml`.
- La fila en `docs/dependencias.md` ya existía (la escribió el leader en F1.4), no se tocó.
- Verificación: `pnpm exec vitest run tests/guards/guard-dependencias-aprobadas.test.ts` → 2 passed.
- Confirmado por `git diff package.json`: la única entrada nueva es `@supabase/storage-js`.

## T1 — Dominio base del módulo

Archivos creados:
- `lib/modules/recetas/domain/actor.ts` — `Actor`, `ADMIN_ROLE_NAME`, `requireAdmin`
  (falla cerrado, igualdad exacta, sin `includes` ni normalización).
- `lib/modules/recetas/domain/errors.ts` — `RecetasError` (clase base abstracta) y
  `UnauthorizedError`, `NotFoundError`, `DuplicateNameError`, `ValidationError`.
- `lib/modules/recetas/domain/page.ts` — `Page<T>` (estructural, no importado de
  `inventario` ni de `lib/shared`), `PageQuery`, `pageQuerySchema` (zod: solo valida
  forma/mínimo; el default de 10 y el tope de 25 los aplica `lib/shared/pagination.ts`
  en el adaptador driven, no aquí).
- `domain/recipe-name.ts` no se tocó (ya existía, QC-24).

Verificación: `pnpm run typecheck` limpio. `grep "^import"` sobre `domain/*.ts` confirma
que solo se importa `zod` y `./errors` — nada de framework, Prisma, `lib/shared/` ni
`lib/composition`.

## T2 — Detección de formato y límites de la imagen

- `lib/modules/recetas/domain/recipe-image.ts` — función pura `validateRecipeImage(bytes)`:
  rechaza por tamaño (`> 5 MB`, `MAX_IMAGE_BYTES`) y detecta JPEG/PNG/WebP por los bytes
  (firmas `FF D8 FF`, `89 50 4E 47 0D 0A 1A 0A`, `RIFF`…`WEBP`), devolviendo `contentType`
  y `extension` derivados de la firma. Cualquier otra firma (PDF, SVG con o sin
  declaración XML, HEIC) se rechaza.
- Test: `tests/unit/recetas/recipe-image.test.ts` — tabla de firmas (3 aceptados con
  `it.each`, 4 rechazados con `it.each`: PDF, SVG×2, HEIC) + corte de 5 MB (rechaza
  `MAX_IMAGE_BYTES + 1`, acepta exactamente `MAX_IMAGE_BYTES`).

Verificación: `pnpm exec vitest run tests/unit/recetas/recipe-image.test.ts` → 9 passed.

## T3 — Test de alcance, adelantado

- `tests/unit/recetas/scope.test.ts`, cinco `it`:
  1. No hay pantalla/página/componente de recetas bajo `app/` ni `components/`, ni spec
     nuevo en `e2e/` (patrón `/recet|recipe/i` sobre la ruta completa, igual que el
     patrón que usó QC-20 para `product|presentation`).
  2. No hay route handler bajo `app/api/recetas` ni `app/api/recipes`, y todo archivo que
     aparezca en `adapters/driving/` debe declarar `'use server'` en su primera línea.
  3. `lib/modules/recetas/**` no reimplementa la aritmética de paginación: se buscan los
     patrones `Math.ceil(total…)`, `(page - 1) * …` y multiplicación directa por
     `pageSize` en el texto fuente del módulo (excluidos los tests).
  4. Ningún archivo bajo `tests/` importa `@supabase/storage-js` (import/require) ni el
     adaptador `recipe-image-supabase` (el propio archivo de test se excluye del barrido,
     porque cita esos literales a propósito para poder buscarlos).
  5. `db/schema.prisma` — `model Recipe` y `model RecipeLine` no ganaron ni perdieron
     ninguna columna, índice o restricción respecto al estado que dejó QC-24: se extrae
     el cuerpo de cada modelo, se normalizan espacios internos y se compara línea a línea
     (`toEqual`) contra el snapshot exacto de columnas, `@@index`, `@@unique` y `@@map`
     actuales. Es descriptivo sobre estos DOS modelos, no un censo global del schema.

Verificación: `pnpm exec vitest run tests/unit/recetas/scope.test.ts` → 5 passed.

En la primera pasada el test se auto-disparaba en dos sitios (falsos positivos
detectados y corregidos antes de darlo por bueno):
- El patrón de paginación era demasiado genérico (`offset[:=]`, `totalPages[:=]`)
  y disparaba sobre `Page<T>.totalPages: number` (declaración de tipo, no cómputo) y
  sobre el parámetro `offset = 0` de `recipe-image.ts` (offset de bytes, no de
  paginación). Se acotó a los tres patrones de arriba, atados a `page`/`total`/`pageSize`.
- El propio `scope.test.ts` se detectaba a sí mismo al buscar la cadena literal
  `@supabase/storage-js` (porque la cita en su propia regex). Se excluyó su propio
  `fileURLToPath(import.meta.url)` del barrido.

## Mapa `R<n> → test` de este grupo

| R | Test |
| --- | --- |
| R23 | `tests/unit/recetas/recipe-image.test.ts` |
| R31 (parte) | `tests/unit/recetas/scope.test.ts` → `el modulo recetas no reimplementa el calculo de paginacion` |
| R41 | `tests/unit/recetas/scope.test.ts` → `esta feature no anade ninguna columna, indice ni restriccion a recipes ni a recipe_lines` |
| R43 (parte) | `tests/unit/recetas/scope.test.ts` → `ningun test importa @supabase/storage-js ni el adaptador de Storage` |
| R44 | `tests/unit/recetas/scope.test.ts` → `no existe ninguna pantalla, pagina ni componente de recetas, ni spec E2E nuevo` |

R2, R3, R38, R39 (autorización, borde, Server Actions) NO se cierran en este grupo: sus
tests (`authorization.test.ts`, `recipe-input.test.ts`, `recipe-actions.test.ts`) son del
Grupo B/C, que dependen de los casos de uso y las Server Actions que este grupo aún no
construye. La cláusula de R39 que sí toca T3 —"no hay ningún route handler bajo
`app/api`"— queda cubierta arriba.

## Verificación de la tanda (Grupo A completo)

- `pnpm run typecheck` → limpio (sin salida, exit 0).
- `pnpm run lint` → limpio (sin salida, exit 0).
- `pnpm exec vitest run tests/unit/recetas` → 6 test files, 62 tests, todos passed
  (incluye los 2 nuevos de este grupo más los ya existentes de QC-24:
  `module-contract.test.ts`, `domain/`, `schema/`).
- `pnpm exec vitest run guard --passWithNoTests` → 12 test files, 123 tests, todos passed
  (incluye `guard-dependencias-aprobadas`, `guard-arquitectura-modulos`, `guard-rls-force`
  sin regresión).

No se corrió `./init.sh` completo ni la suite entera: instrucción explícita del prompt
para esta tanda (solo typecheck + lint + los tests propios del grupo). Corresponde a T16
cerrar con `./init.sh` completo antes del PR.

## Qué resultó imposible de cumplir tal como está escrito en el spec

Nada. Las cuatro tasks del Grupo A se completaron tal como las describen `design.md` y
`tasks.md`, sin necesidad de reinterpretar ningún requisito.

## Grupo B — casos de uso (T4, T5, T6, T7, T8, T17)

Alcance de esta tanda: los cinco casos de uso de `recetas`, sus esquemas de entrada, sus
tipos de salida y puertos, el test de autorización de los cinco casos y el ciclo de vida
completo de la imagen en la edición. **T18 NO entra** (depende de T9 — `ProductCatalog`
real de `inventario` — que todavía no existe; otra tanda del Grupo C lo hace, y ajustará
si hace falta la lógica de conjuntos que T6 ya deja implementada).

### T4 — Esquemas de entrada zod

- `lib/modules/recetas/domain/recipe-input.ts`: `recipeLineSchema` (productId uuid,
  `quantity` cadena decimal(14,4) con regex + `refine` de `> 0` real, `unit` trim min 1),
  `createRecipeSchema` (nombre trim 1–120 con `refine` de `normalizeRecipeName !== ''`,
  descripción trim máx 500 `nullish`, `steps` array trim 1–1000 máx 50 con default `[]`,
  `lines` array con `refine` de producto no repetido, `image` opcional `{ bytes }` —solo
  dos estados—), `updateRecipeSchema` (mismo shape, pero `image` es
  `.nullable().optional()` para admitir los TRES estados: omitido/`{ bytes }`/`null`).
- **Punto crítico verificado con test explícito** (R47): `updateRecipeSchema.parse({...sin
  image...})` da `image === undefined`, y `updateRecipeSchema.parse({..., image: null})`
  da `image === null`, sin que uno pise al otro. Se usó `.nullable().optional()` (nunca
  `.default()`) precisamente para preservar esa distinción.
- Test: `tests/unit/recetas/recipe-input.test.ts` — 13 tests.

### T5 — Tipos de salida y puertos

- `lib/modules/recetas/domain/recipe-view.ts`: `RecipeSummary` (sin `lines`),
  `RecipeLineView`, `RecipeDetail`.
- `lib/modules/recetas/ports/recipe-repository.ts`: `RecipeRepository` copiado
  literalmente de `design.md > 7.3` (`create`, `findAliveById`, `listAlive`,
  `replaceAlive`, `softDeleteAlive` con sus resultados discriminados), más
  `NewRecipe`/`RecipeRow`/`RecipeLineData`/`RecipeLineRow` (quantity siempre como
  `string`, nunca `number` ni `Prisma.Decimal`).
- `lib/modules/recetas/ports/recipe-image-storage.ts`: `RecipeImageStorage`
  (`upload`/`remove`/`publicUrl`) y `RecipeImageUpload`, copiados de `design.md > 9.1`.
- Ningún import prohibido: `ports/` no importa Prisma, `@supabase/storage-js` ni
  framework (confirmado por `guard-arquitectura-modulos.test.ts`, que sigue en verde).

### T6 — Los cinco casos de uso

`domain/create-recipe.ts`, `get-recipe.ts`, `list-recipes.ts`, `update-recipe.ts`,
`delete-recipe.ts`. `requireAdmin(actor)` en la primera línea de los cinco, antes de zod
y de tocar cualquier puerto.

- **create**: valida, si hay líneas pide `products.findRefs` una sola vez sobre TODAS
  (R17, R46: en el alta todas son "nuevas"), si hay imagen la valida con
  `validateRecipeImage` y sube ANTES de `repository.create`; `'duplicate'` del puerto se
  traduce a `DuplicateNameError` (R8).
- **update**: lee `repository.findAliveById(id)` PRIMERO (si no existe, `NotFoundError`,
  R37) — para conocer `imagePath` anterior y las líneas ya existentes. Calcula
  `idsANuevoValidar = idsEnviados \ idsYaEnLaReceta` y llama `products.findRefs` SOLO
  sobre esos (R45, R46): la línea preexistente con producto de baja se admite sin
  consultar el catálogo por ella. Los tres estados de `image` (T17, ver abajo) se
  implementan aquí directamente.
- **delete**: `softDeleteAlive` → `NotFoundError` si `'not_found'`. NO recibe
  `RecipeImageStorage` en sus deps: estructuralmente no puede tocar el almacenamiento
  (R27).
- **get**: arma `RecipeDetail` con `imageUrl` vía `images.publicUrl(imagePath)` si hay
  ruta, y `productName` de CADA línea (incluida la de baja, que sale `null`) vía
  `products.findRefs` sobre todos los `productId` de las líneas — uso que DECORA, distinto
  del que VALIDA en create/update (R18).
- **list**: valida con `pageQuerySchema` y DELEGA toda la aritmética de paginación —
  `toOffsetLimit`/`buildPage`— a dos funciones INYECTADAS en `ListRecipesDeps` (ver nota
  de diseño abajo). Mapea a `RecipeSummary[]` sin líneas (R33).
- Autoría (R6): `create` escribe `createdBy`+`updatedBy` con `actor.id`; `update`/`delete`
  solo pasan `actor.id` como el `actorId` de `replaceAlive`/`softDeleteAlive` (el puerto no
  expone `createdBy` en esas firmas, así que conservar el autor de creación real a través
  de un `UPDATE` lo demuestra el adaptador Prisma + el test de integración, T10/T14 —no
  este archivo, mismo criterio que dejó `inventario`).
- Test: `tests/unit/recetas/recipe-service.test.ts` — 13 tests.

**Decisión de diseño no explícita en `design.md > 7.3` que hubo que resolver**: el puerto
`listAlive(offset, limit)` recibe `offset`/`limit` ya calculados, pero el dominio no puede
importar `lib/shared/pagination` (R40) y R31 prohíbe reimplementar esa aritmética dentro
de `recetas`. Se resolvió inyectando `toOffsetLimit` y `buildPage` como DEPENDENCIAS de
`ListRecipesDeps` (mismo patrón que `now`): `list-recipes.ts` no contiene ninguna
aritmética propia — ni `Math.ceil`, ni `(page-1)*`, ni `* pageSize` — y quien cablea el
caso de uso en producción (Grupo C, T12) le pasa las funciones REALES importadas de
`lib/shared/pagination`. El test de alcance (`scope.test.ts`, ya verde) vigila justo estos
patrones sobre el texto fuente y sigue pasando. En los tests de este grupo se le pasan
implementaciones equivalentes simples porque `lib/shared/pagination` no está prohibido de
importar desde un test.

### T7 — Composición de la URL de lectura

Ya cubierto dentro de `get-recipe.ts`/`list-recipes.ts` (T6): `imagePath → imageUrl` vía
`images.publicUrl`. Test dedicado: `tests/unit/recetas/recipe-image-url.test.ts` — 3
tests: persiste la ruta (nunca la URL) en `NewRecipe.imagePath`, compone la URL al leer
con un doble de `RecipeImageStorage`, y confirma que la URL no lleva firma ni caducidad
(sin `token=`/`signature=`/`expires=`). Ningún caso de uso conoce el bucket ni la URL del
proyecto: el doble del puerto es libre de componer la URL como quiera.

### T8 — Test de autorización de los cinco casos de uso

`tests/unit/recetas/authorization.test.ts` — dobles de los TRES puertos (repositorio,
catálogo, almacenamiento) que **lanzan si se les llama**. Los cinco casos de uso, con
actor Operador, `roleName: null`, `roleName: ''`, rol desconocido (`'Administradores
externos'` y `'Fantasma'`) y actor `undefined`: en los cinco, `expect(...).not.toHaveBeenCalled()`
sobre los tres dobles. Más un test de que ningún archivo de `domain/` lee
`next/headers`/`cookies(`/`headers(`/`getSessionUser`/`lib/composition`. 4 tests.

### T17 — Ciclo de vida de la imagen en la edición

Implementado dentro de `update-recipe.ts` (T6): los tres estados de `image` siguiendo la
tabla de `design.md > 7.1` y el orden de operaciones de `> 9.3`. Test dedicado:
`tests/unit/recetas/recipe-image-lifecycle.test.ts` — 7 tests: omitido conserva sin tocar
el almacenamiento; `null` deja `imagePath` en `NULL` y borra (o no llama a `remove` si no
había imagen previa); `{ bytes }` sube, persiste y borra la anterior DESPUÉS de que
`replaceAlive` confirme; los dos caminos de borrado (`{ bytes }` y `null`) usan el MISMO
`images.remove` — se verifica comparando las claves del doble entre los dos caminos, no
solo que ambos lo llamen—; y dos casos con `remove` que rechaza (uno por cada camino de
borrado) donde la edición resuelve igual, `replaceAlive` ya se llamó una sola vez, y el
resultado trae `warnings: [{ operation: 'remove', path, message }]`.

### Ajuste a un test preexistente de QC-24

`tests/unit/recetas/module-contract.test.ts` (sembrado por QC-24, T10 de esa ficha)
afirmaba que `lib/modules/recetas/ports` debía quedar VACÍA — cierto cuando esa ficha
cerró, falso a propósito ahora que T5 la llena. Se actualizó el test para que solo seguir
vigilando que `adapters/driven` y `adapters/driving` sigan vacíos (eso es Grupo C, T9–T13,
todavía no construido en esta tanda), con el comentario explicando por qué `ports/` salió
de esa lista. No se tocó ninguna otra aserción del archivo.

## Mapa `R<n> → test` de este grupo

| R | Test |
| --- | --- |
| R1 | `tests/unit/recetas/authorization.test.ts` → `cada caso de uso recibe el actor por parametro y no lee ninguna sesion` |
| R2 | `tests/unit/recetas/authorization.test.ts` → `un actor con rol Operador es rechazado en los cinco casos de uso sin llamar a ningun puerto` |
| R3 | `tests/unit/recetas/authorization.test.ts` → `un actor ausente, con rol nulo o con rol desconocido es rechazado igual que el Operador` |
| R5 | `tests/unit/recetas/recipe-service.test.ts` → `crea la receta junto con sus lineas y devuelve su identificador` |
| R6 | `tests/unit/recetas/recipe-service.test.ts` → `guarda al actor como autor de creacion y de modificacion al crear, y solo de modificacion al editar y al borrar` |
| R7 | `tests/unit/recetas/recipe-input.test.ts` → `rechaza el nombre vacio...` / `...mas de 120...` |
| R8 | `tests/unit/recetas/recipe-service.test.ts` → `persiste el nombre normalizado...traduce el duplicado` |
| R9 | `tests/unit/recetas/recipe-input.test.ts` → `rechaza como nombre invalido el que queda vacio al normalizarlo` |
| R11 | `tests/unit/recetas/recipe-service.test.ts` → `la edicion recibe la lista final completa...` |
| R14 | `tests/unit/recetas/recipe-input.test.ts` → `rechaza la cantidad cero, negativa o ausente, y la unidad vacia...` |
| R15 | `tests/unit/recetas/recipe-input.test.ts` → `acepta cualquier texto no vacio como unidad, sin catalogo` |
| R16 | `tests/unit/recetas/recipe-input.test.ts` → `rechaza dos lineas con el mismo producto` |
| R17 | `tests/unit/recetas/recipe-service.test.ts` → `rechaza la linea cuyo producto no existe...` |
| R18 | `tests/unit/recetas/recipe-service.test.ts` → `la lista no trae lineas y el detalle si las trae con producto, cantidad y unidad` |
| R19 | `tests/unit/recetas/recipe-input.test.ts` → `rechaza unos pasos que no son lista de textos...` |
| R20 | `tests/unit/recetas/recipe-input.test.ts` → `rechaza mas de 50 pasos y el paso de mas de 1000 caracteres` |
| R21 | `tests/unit/recetas/recipe-service.test.ts` → `crea y edita la receta sin imagen sin llamar al almacenamiento` |
| R22 | `tests/unit/recetas/recipe-service.test.ts` → `sube la imagen a traves del puerto, con un doble en memoria` |
| R24 | `tests/unit/recetas/recipe-image-url.test.ts` → `persiste la ruta dentro del bucket y compone la URL al leer` |
| R25 | `tests/unit/recetas/recipe-image-url.test.ts` → `la URL que compone el caso de uso no lleva firma ni parametro de expiracion` |
| R26 | `tests/unit/recetas/recipe-service.test.ts` → `al reemplazar la imagen borra el archivo anterior despues de persistir la nueva ruta` |
| R27 | `tests/unit/recetas/recipe-service.test.ts` → `al borrar la receta no llama al almacenamiento y conserva la ruta` |
| R30 (mínimo e integridad) | `tests/unit/recetas/recipe-input.test.ts` → `rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1` |
| R33 | `tests/unit/recetas/recipe-service.test.ts` → `la lista no trae lineas y el detalle si las trae...` |
| R34 | `tests/unit/recetas/recipe-service.test.ts` → `devuelve los autores como identificadores y acepta la receta sin autor` |
| R36 | `tests/unit/recetas/recipe-service.test.ts` → `el detalle de una receta borrada se traduce a no encontrado...` |
| R37 | `tests/unit/recetas/recipe-service.test.ts` → `devuelve no encontrado al consultar, editar o borrar una receta inexistente o ya borrada` |
| R38 | `tests/unit/recetas/recipe-input.test.ts` (todo el archivo: los esquemas validan en el borde) |
| R45 | `tests/unit/recetas/recipe-service.test.ts` → `la edicion recibe la lista final completa...` (linea preexistente admitida sin `findRefs`) |
| R46 | `tests/unit/recetas/recipe-service.test.ts` → `rechaza la linea cuyo producto no existe...` (alta: todas nuevas) |
| R47 | `tests/unit/recetas/recipe-image-lifecycle.test.ts` → `image null deja la receta sin ruta y borra el archivo` / `image omitido conserva...` |
| R48 | `tests/unit/recetas/recipe-image-lifecycle.test.ts` → `reemplazar y quitar la imagen llaman al mismo remove del puerto...` |
| R49 | `tests/unit/recetas/recipe-image-lifecycle.test.ts` → `si el remove falla la edicion no se revierte y devuelve la advertencia con su contexto` |

R4, R10, R12, R13, R23, R28, R29, R31 (parte), R32, R35, R39-R44 no se cierran en este
grupo: son de integración (Grupo D), del adaptador de Storage/config (Grupo C, T9-T11), de
la Server Action (Grupo C, T13), o ya los cierran guardias/tests preexistentes citados en
`tasks.md > Trazabilidad`.

## Verificación de la tanda (Grupo B: T4, T5, T6, T7, T8, T17)

- `pnpm run typecheck` → limpio (sin salida, exit 0).
- `pnpm run lint` → limpio (sin salida, exit 0).
- `pnpm exec vitest run tests/unit/recetas` → **11 test files, 102 tests, todos passed**
  (incluye los 5 archivos nuevos de este grupo — `recipe-input.test.ts` 13,
  `recipe-service.test.ts` 13, `recipe-image-url.test.ts` 3, `authorization.test.ts` 4,
  `recipe-image-lifecycle.test.ts` 7 — más los 6 ya existentes de Grupo A/QC-24, uno de
  ellos ajustado).
- `pnpm exec vitest run guard` → **12 test files, 123 tests, todos passed** (sin
  regresión en `guard-arquitectura-modulos`, `guard-dependencias-aprobadas`,
  `guard-rls-force`).

No se corrió `./init.sh` completo ni la suite entera: instrucción explícita del prompt
para esta tanda. Corresponde a T16 (Grupo D) cerrar con `./init.sh` completo antes del PR.

## Qué resultó imposible de cumplir tal como está escrito en el spec

Nada de R1-R49 resultó imposible. Un punto SÍ exigió una decisión de diseño no explícita
en el texto (documentada arriba, no una reinterpretación de un requisito): cómo dividir la
aritmética de paginación entre `domain/list-recipes.ts` y el adaptador cuando el puerto
`listAlive` recibe `offset`/`limit` ya calculados pero el dominio no puede importar
`lib/shared/pagination` ni reimplementarla (R31, R40). Se resolvió con inyección de
dependencia (`toOffsetLimit`/`buildPage` en `ListRecipesDeps`), verificable porque
`scope.test.ts` ya vigila que `recetas` no contenga esa aritmética y sigue en verde.

## Veredicto

Grupo A (T0–T3) y Grupo B (T4-T8, T17) cerrados: cinco casos de uso con `requireAdmin` en
primera línea, esquemas de entrada que distinguen correctamente los tres estados de
`image` en la edición, el ciclo de vida completo de la imagen (subida/reemplazo/quitar,
mismo `remove` para los dos caminos de borrado, fallo de `remove` no revierte la edición),
y el test de autorización que demuestra que el Operador y los actores inválidos no tocan
ningún puerto. `typecheck`, `lint` y los 225 tests (102 de `recetas` + 123 de guardias)
en verde. T18 queda para la tanda que traiga T9 (`ProductCatalog` real de `inventario`).
Listo para que el Grupo C (T9-T13) construya los adaptadores y el cableado sobre esta
base.

---

# Grupo C — adaptadores y cableado (T9, T18, T10, T11, T12, T13)

## T9 — `ProductCatalog` en `inventario`

- `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts` (nuevo):
  `findProductRefs` (una sola consulta `prisma.product.findMany({ where: { id: { in },
  deletedAt: null }, select: { id, name, unit } })`, con `[]` de atajo si `ids` llega
  vacío para no ejecutar un `IN ()` sin sentido) y `toProductRef` (mapeo puro, testeable
  sin base).
- Test: `tests/unit/inventario/product-catalog.test.ts` — mapeo puro + contrato de
  `findRefs([])`. Mismo criterio de honestidad que `product-prisma.test.ts`: no toca
  Postgres; la garantía real de `deleted_at IS NULL` es de integración (T14, Grupo D, no
  de esta tanda).
- Guardia: `recetas` sigue sin `prisma.product` en ninguna parte (verificado con
  `guard-arquitectura-modulos` en verde y con el ajuste de `module-contract.test.ts`
  descrito más abajo).

## T18 — Validación de producto solo para las líneas nuevas

- `tests/unit/recetas/recipe-lines-catalog.test.ts` (nuevo): demuestra con
  `expect(findRefs).toHaveBeenCalledWith(<ids exactos>)` — nunca solo `toHaveBeenCalled`
  — que la edición NO pregunta al catálogo por la línea preexistente (R45), que
  `findRefs` se llama con el conjunto EXACTO de ids nuevos cuando hay mezcla de líneas
  viejas y nuevas, que una línea nueva con producto inexistente/de baja se rechaza sin
  tocar `replaceAlive` (R46), que el alta trata todas las líneas como nuevas (R46), y que
  el detalle (`get-recipe.ts`) sigue pidiendo `findRefs` sobre TODAS las líneas —el
  producto de baja sale con `productName: null` (R18)—.
- La lógica de `update-recipe.ts` escrita en Grupo B (diferencia de conjuntos
  `idsANuevoValidar = idsEnviados \ idsYaEnLaReceta`) **no tenía ningún bug**: los cuatro
  casos del test pasaron sin tocar ese archivo. No hubo que corregir nada de lo que dejó
  la sesión anterior.

## T10 — Adaptador driven de persistencia

- `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts` (nuevo). Único
  archivo del módulo `recetas` que importa `@prisma/client`.
  - `toDecimalInput`/`fromDecimalQuantity`: conversión `string ↔ Prisma.Decimal` de
    `quantity`, mismo criterio que `cost` en `inventario`.
  - `toRecipeRow`/`toSteps`/`toLineRow`: mapeo puro de una fila de Prisma (con sus
    líneas incluidas) al `RecipeRow` del puerto.
  - `createRecipe`: `prisma.recipe.create` con `lines: { create: [...] }` anidado (en el
    alta TODAS las líneas son nuevas), `nameNormalized` calculado aquí con
    `normalizeRecipeName` (única definición, R8), `P2002`/SQLSTATE `23505` → `'duplicate'`.
  - `findAliveRecipeById`: `findFirst` con `deletedAt: null` e `include: { lines: true }`.
  - `listAliveRecipes(offset, limit)`: **no llama a `toOffsetLimit`** — el ajuste
    explícito del prompt de esta tanda sobre `list-recipes.ts` (Grupo B): el dominio
    recibe `offset`/`limit` YA calculados como dependencia inyectada
    (`lib/composition` los inyecta con las funciones reales de `lib/shared/pagination`,
    T12), así que el adaptador solo pasa `skip`/`take` a Prisma sin aritmética propia.
    Orden `name ASC` sin desempate (D13).
  - `replaceAliveRecipe`: los tres pasos de `design.md > 8` dentro de una sola
    `prisma.$transaction`: `updateMany` con `deletedAt: null` en el `where` (`count === 0`
    → `'not_found'`), `deleteMany` de las líneas cuyo `productId` no está en la lista
    final (borrado físico real, sin `deletedAt` — `RecipeLine` no lo tiene), y un
    `upsert` por línea final sobre la clave natural `recipeId_productId` (confirmado
    contra el `.d.ts` generado de Prisma: el nombre del campo compuesto es
    `recipeId_productId`, no el `map` del `@@unique`).
  - `softDeleteAliveRecipe`: `updateMany` con `deletedAt: null` en el `where`,
    `count === 0` → `'not_found'`.
  - Traducción de SQLSTATE: `sqlStateOf` (mismo criterio que el helper homónimo de
    `tests/integration/recetas/recetas-constraints.int.test.ts`, que lee `meta.code`) +
    `isUniqueNameViolation` (P2002 o `23505` → `'duplicate'`) e
    `isQuantityCheckViolation` (`23514` → `ValidationError`, nunca `'duplicate'`).
  - **Aviso honesto para quien escriba T14 (Grupo D):** no hay forma de confirmar en esta
    sesión, sin acceso a una base Postgres real (el worktree no tiene `.env` con
    `DATABASE_URL`/`DIRECT_URL`), qué clase de error concreta lanza el cliente Prisma
    TIPADO (no `$queryRaw`) para una violación del `CHECK quantity > 0`: puede llegar
    como `PrismaClientKnownRequestError` con `meta.code` poblado, o como
    `PrismaClientUnknownRequestError` sin `meta` en absoluto — el propio `design.md > T10`
    lo señala como algo a investigar. `isQuantityCheckViolation` cubre el primer caso
    (vía `sqlStateOf`); si T14 descubre contra Postgres real que el error llega sin
    `meta.code`, `sqlStateOf`/`isQuantityCheckViolation` son las dos únicas funciones que
    hay que ajustar, y quedan aisladas a propósito para eso.
- Verificación de esta task: solo `pnpm run typecheck` (criterio explícito del prompt:
  "Hecho cuando `pnpm run typecheck` limpio"), limpio. No se escribió un test de
  integración aquí (es T14, Grupo D, fuera de esta tanda) ni uno unitario de las
  funciones puras (no lo exigió el criterio de la task; si se quiere replicar el patrón
  de `product-prisma.test.ts`/`presentation-prisma.test.ts`, es trabajo de refuerzo, no
  bloqueante).

## T11 — Adaptador driven de Storage y su configuración

- `lib/modules/recetas/adapters/driven/config/storage-config-env.ts` (nuevo): calco
  exacto del patrón de `initial-access-credentials-env.ts` (QC-6) — los tres nombres de
  variable viven solo como elementos del arreglo `REQUIRED_ENV_VAR_NAMES`, se leen DENTRO
  de una función (nunca al importar), y el error nombra las que faltan sin filtrar ningún
  valor.
- `lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts` (nuevo): único
  archivo del repo que importa `@supabase/storage-js` (confirmado leyendo el `.d.ts`
  generado del paquete instalado, versión 2.115.0, para la firma real de `StorageClient`,
  `.from(bucket).upload/getPublicUrl/remove`). `bucketApi()` construye el cliente Y LEE LA
  CONFIGURACIÓN en cada llamada (nunca al importar el módulo, R43). `uploadRecipeImage`
  genera `recetas/<uuid>.<ext>` con `randomUUID()` y devuelve la ruta. `removeRecipeImage`
  es la ÚNICA operación de borrado — no hay `clearImage` ni equivalente (R48).
  `recipeImagePublicUrl` compone la URL pública sin firma vía `getPublicUrl` del SDK.
- `.env.example`: bloque nuevo "Storage de recetas (QC-25)" con las tres variables
  `SUPABASE_STORAGE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_STORAGE_KEY`, vacías y
  documentadas, con nota explícita de por qué NO reutiliza `SUPABASE_PROJECT_REF` (esa es
  solo para los servidores MCP, `design.md > 9.4`).
- Test: `tests/unit/recetas/storage-config.test.ts` (nuevo) — verifica que las tres
  variables están declaradas y vacías en `.env.example`, que el adaptador de config falla
  nombrando exactamente las que faltan sin incluir ningún valor presente, y que con las
  tres presentes resuelve sin lanzar. NUNCA importa el adaptador de Storage real ni
  `@supabase/storage-js` (R43) — verificado además por `scope.test.ts`, que barre todo
  `tests/` buscando esos dos patrones.

## T12 — Contrato y punto de composición

- `lib/modules/recetas/index.ts`: reescrito para reexportar TODO lo público —tipos,
  errores, esquemas zod, `Page`/`PageQuery`, `validateRecipeImage`, y las cinco
  factories `createCreateRecipe`/`createGetRecipe`/`createListRecipes`/
  `createUpdateRecipe`/`createDeleteRecipe`—, solo de `./domain`. `normalizeRecipeName`
  se conservó igual.
- `lib/composition/index.ts`: se AÑADIÓ un bloque nuevo al final, sin reordenar ni
  reformatear nada de `identity` ni de `inventario` (diff mínimo, por la advertencia del
  prompt sobre la sesión paralela de QC-22). Cablea `productCatalog: ProductCatalog =
  { findRefs: findProductRefs }`, `recipeRepository: RecipeRepository` (las cinco
  funciones de T10), `recipeImageStorage: RecipeImageStorage` (las tres funciones de
  T11 — construir este objeto NO invoca ninguna de ellas, así que no lee variables de
  entorno ni toca red, R43), y la fachada `export const recetas = {...}`, inyectando
  `toOffsetLimit`/`buildPage` REALES de `@/lib/shared/pagination` en `createListRecipes`
  tal como pedía el prompt.
- **Ajuste sobre `tests/unit/recetas/module-contract.test.ts` (no es mío por task, pero
  bloqueaba T10/T12 legítimamente):**
  - El segundo `it` prohibía `@prisma/client` en TODO `lib/modules/recetas/**` sin
    excepción — texto más estricto que `design.md > 1`/`> 7.3`, que nombra
    `recipe-prisma.ts` como el ÚNICO archivo del módulo que debe importarlo. Añadí una
    excepción nombrada exactamente a ese archivo (`prisma.product` sigue prohibido en
    TODO el módulo sin excepción, esa parte no cambió). La guardia real de "solo un
    archivo lo importa" la sigue vigilando `guard-arquitectura-modulos.test.ts` (bloque
    10, propiedad de modelos).
  - El tercer `it` ("la feature no añade adaptadores driving...") era, por su propio
    comentario, un checkpoint de Grupo A/B que anticipaba que Grupo C llenaría
    `adapters/`: afirmaba que `adapters/driven`/`adapters/driving` debían seguir vacías,
    que ningún archivo del módulo declaraba `'use server'`, y que `lib/composition` no
    mencionaba `recetas`. Las tres cosas dejan de ser ciertas por diseño en este grupo
    (T10, T11, T13). Reescribí ese `it` para que siga vigilando lo que SÍ sigue siendo
    requisito de esta feature (R44: ninguna pantalla ni ruta de recetas bajo `app/`) y
    retiré las tres aserciones obsoletas, dejando explicado en el comentario por qué y
    dónde quedan cubiertas ahora (`scope.test.ts`, `recipe-actions.test.ts`).
  - `tests/unit/recetas/scope.test.ts` NO se tocó (T15, Grupo D, es quien la revisa
    formalmente) — sigue en verde tal cual porque ya estaba escrita para tolerar
    `adapters/driving` con contenido (revisa que cada archivo ahí declare `'use server'`),
    y mi único ajuste de comentario en `storage-config.test.ts` fue para dejar de mencionar
    literalmente el nombre del adaptador de Storage en un comentario, que su assertion de
    R43 detectaba como falso positivo (busca el texto crudo, no distingue comentario de
    import real).

## T13 — Server Actions

- `lib/modules/recetas/adapters/driving/recipe-actions.ts` (nuevo), `'use server'` en la
  primera línea. Actor resuelto con `identity.getSessionUser()` vía `@/lib/composition`
  (mismo patrón exacto que `product-actions.ts`). Cinco funciones:
  `createRecipeAction(input)`, `updateRecipeAction(id, input)`, `deleteRecipeAction(id)`,
  `getRecipeAction(id)`, `listRecipesAction(query)`.
  - **Decisión de forma de entrada, no cerrada por el spec:** create/update reciben
    `unknown` tipado, NO `FormData`. A diferencia de `inventario`, una receta trae listas
    anidadas (pasos, líneas de producto) sin representación natural en campos planos de
    formulario, y cómo las envía el formulario de QC-26 es decisión de esa ficha, no de
    esta — documentado en el comentario de cabecera del archivo para que quien construya
    QC-26 lo tenga presente.
  - Create/update validan con `createRecipeSchema`/`updateRecipeSchema` (los mismos del
    contrato, no una reimplementación) ANTES de llamar al caso de uso — cierra R38 y es
    lo que demuestra el test con el doble del caso de uso que falla si se le llama.
  - Errores de dominio (`RecetasError` y sus subclases) se traducen a
    `{ status: 'error', code, message }`; cualquier otro error se relanza.
  - Las advertencias de `updateRecipe` (`warnings`, R49) se recorren y se registran con
    `console.error` con su contexto (operación + ruta), y la acción sigue devolviendo
    `{ status: 'success' }` — una advertencia de borrado NUNCA convierte la edición en
    error para el llamante.
- Test: `tests/unit/recetas/recipe-actions.test.ts` (nuevo), mockeando
  `@/lib/composition` igual que `product-actions.test.ts`: entrada inválida rechazada sin
  llamar al caso de uso (R38), actor resuelto de la sesión y `null` cuando no hay sesión
  (falla cerrado), advertencia de almacenamiento registrada con `console.error` sin
  convertir la edición en error, traducción de errores de dominio a `code` estable,
  relanzamiento de un error que no es de dominio, y confirmación de que
  `app/api/recetas`/`app/api/recipes` no existen (R39).

## Verificación de la tanda (Grupo C: T9, T18, T10, T11, T12, T13)

- `pnpm run typecheck` → limpio (sin salida, exit 0).
- `pnpm run lint` → limpio (sin salida, exit 0).
- `pnpm exec vitest run tests/unit/recetas tests/unit/inventario/product-catalog.test.ts
  tests/guards/guard-arquitectura-modulos.test.ts` → **16 test files, 182 tests, todos
  passed** (incluye los 4 archivos nuevos de este grupo —
  `recipe-lines-catalog.test.ts` 5, `storage-config.test.ts` 8, `recipe-actions.test.ts`
  10, `product-catalog.test.ts` 3 — más el ajuste sin regresión de `module-contract.test.ts`
  y de `storage-config.test.ts`/comentario, sobre los 11 ya existentes de Grupo A/B).
- Además, para descartar regresión fuera del recorte explícito de la tanda: `pnpm exec
  vitest run tests/unit/inventario tests/guards` → **25 test files, 263 tests, todos
  passed**; y `pnpm exec vitest run tests/unit` (TODA la suite unitaria del repo,
  incluidos `identity`) → **79 test files, 811 tests, todos passed**. No se corrió
  `./init.sh` completo ni la suite de integración (`tests/integration/**`, que necesita
  Postgres real y este worktree no tiene `.env`): eso es T16, Grupo D, antes del PR.

## Qué resultó imposible de cumplir tal como está escrito, y ajustes sobre lo que dejó Grupo B

- **Nada de R1-R49 resultó imposible** en este grupo tampoco.
- **`update-recipe.ts` (Grupo B) no tenía ningún bug**: T18 lo puso a prueba
  explícitamente (mezcla de línea vieja + línea nueva, alta con todas nuevas, línea nueva
  de producto de baja rechazada) y los cuatro casos pasaron sin tocar ese archivo.
- **Dos ajustes, documentados y acotados, sobre `tests/unit/recetas/module-contract.test.ts`**
  (no producido por mí, pero que bloqueaba legítimamente T10/T12 tal como estaba escrito):
  ver el detalle en la sección de T12 de arriba. Ninguno relaja una guardia real —la
  guardia estática (`guard-arquitectura-modulos.test.ts`) sigue vigilando exactamente lo
  mismo que antes—: solo se retiraron aserciones de un test ad-hoc que databan de cuando
  `adapters/` todavía no existía y que su propio comentario anticipaba como transitorias.
- **Incertidumbre señalada, no resuelta, sobre la traducción del SQLSTATE `23514`** en
  `recipe-prisma.ts` (T10): sin acceso a Postgres real en esta sesión no se pudo confirmar
  empíricamente si el cliente Prisma tipado expone `meta.code` para una violación de
  `CHECK` (a diferencia de un `$queryRaw`, que sí lo hace de forma comprobada, según el
  propio `tests/integration/recetas/recetas-constraints.int.test.ts` de QC-24). La
  implementación cubre el caso documentado (`meta.code === '23514'`) y dejó aislada la
  función que T14 (Grupo D, integración contra Postgres real) tendrá que ajustar si el
  comportamiento real difiere.

## Veredicto

Grupo C (T9, T18, T10, T11, T12, T13) cerrado: `ProductCatalog` real de `inventario`
consultado por `recetas` sin tocar `prisma.product`; persistencia de receta con
conciliación transaccional de líneas y traducción de SQLSTATE; Storage de Supabase
detrás del puerto con configuración diferida y `.env.example` documentado; contrato
público completo y composición cableada sin tocar `identity`/`inventario`; Server
Actions con validación en el borde y advertencias de almacenamiento registradas sin
romper la edición. `typecheck`, `lint` y 811 tests de la suite unitaria completa en
verde. Falta el Grupo D (T14 integración contra Postgres real, T15 cierre de alcance,
T16 `./init.sh` completo) para dar la feature por terminada.
