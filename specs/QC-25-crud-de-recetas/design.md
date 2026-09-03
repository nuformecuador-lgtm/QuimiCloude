# QC-25 — crud-de-recetas · design.md

> Zona: `backend` · Complejidad: `high` · depends_on: `QC-24`, `QC-20`, `QC-8` ·
> Rama: `feature/QC-25-crud-de-recetas`
>
> El **qué** está en `requirements.md` (R1–R49) y su alcance lo cerró el humano el 2026-09-03: 23
> filas de «Decisiones cerradas» al acotar, más las **tres** que cerró en F1.4 respondiendo a las
> preguntas 5, 6 y 7 de este diseño (§ 13) —**R45–R49**—. Aquí va el **cómo**: qué archivos nacen, qué contratos
> entran y salen, cómo se concilia la lista de líneas, cómo se sube la imagen sin que el dominio
> conozca Supabase, qué variables de entorno se declaran y qué alternativas se descartaron.
>
> **El modelo ya existe y esta ficha NO lo toca.** QC-24 dejó `Recipe` y `RecipeLine` en
> `db/schema.prisma` con su migración, su índice único **parcial**
> (`recipes_name_unique … WHERE deleted_at IS NULL`), el `CHECK` de `quantity > 0`, el único
> `(recipe_id, product_id)`, las FK escalares a `users` y a `products`, y la RLS forzada. Esta
> feature **no aporta migración** (R41).
>
> **La forma del módulo ya está fijada.** `identity` (QC-7/QC-8/QC-19) e `inventario` (QC-20) son
> el patrón: `domain/` + `ports/` + `adapters/driven|driving/` + contrato + `lib/composition/`.
> Aquí se copia, no se inventa otra.

---

## 1. Qué construye esta feature, y qué archivos toca

`lib/modules/recetas/` existe hoy con **dos archivos**: el contrato `index.ts` y
`domain/recipe-name.ts` (`normalizeRecipeName`). Esta feature es la que le da contenido.

| Archivo | Qué se hace |
| --- | --- |
| `lib/modules/recetas/domain/*` | Actor y autorización, errores, esquemas zod de entrada, tipos de salida, detección de formato de imagen y **cinco casos de uso**. |
| `lib/modules/recetas/ports/recipe-repository.ts` | Puerto de persistencia (§ 7). |
| `lib/modules/recetas/ports/recipe-image-storage.ts` | Puerto de almacenamiento de imagen (§ 9). |
| `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts` | Implementación Prisma del repositorio. Único archivo del módulo que toca `@prisma/client`. |
| `lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts` | Implementación del puerto de imagen con `@supabase/storage-js`. Único archivo del repo que importa esa librería. |
| `lib/modules/recetas/adapters/driven/config/storage-config-env.ts` | Lee las tres variables de entorno del Storage (R28). |
| `lib/modules/recetas/adapters/driving/recipe-actions.ts` | Server Actions (R39). |
| `lib/modules/recetas/index.ts` | Contrato público: además de `normalizeRecipeName`, reexporta tipos, esquemas, errores y las cinco factories. Solo de `./domain`. |
| `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts` | **Archivo nuevo en `inventario`**: implementa `ProductCatalog` (§ 6), el hueco que QC-24 dejó abierto en el contrato. |
| `lib/composition/index.ts` | Se **añade** la fachada `recetas` y el cableado de `ProductCatalog`. No se toca `identity` ni `inventario`. |
| `.env.example` | Bloque nuevo con las tres variables del Storage, **declaradas y vacías** (R28). |
| `package.json` | Una sola dependencia nueva: `@supabase/storage-js` (§ 10). |
| `tests/…` | Ver § 14. |

**No se toca `app/`, ni `components/`, ni `middleware.ts`, ni `db/`** (R41, R44): la pantalla es
QC-26 y el modelo es QC-24.

---

## 2. Lo que se consume del modelo, sin re-especificarlo

De `Recipe`: `id`, `name`, `nameNormalized`, `description`, `steps` (JSON), `imagePath`,
`createdBy`, `updatedBy`, `createdAt`, `updatedAt`, `deletedAt`. De `RecipeLine`: `id`,
`recipeId`, `productId`, `quantity` (`Decimal(14,4)`), `unit`, marcas de tiempo.

Tres cosas que el implementer tiene que tener presentes y que no son evidentes:

- **El índice único es parcial** (`WHERE deleted_at IS NULL`). Por eso R8 habla de «otra receta
  **viva**»: borrar una receta libera su nombre, y eso es decisión cerrada de QC-24, no un efecto
  colateral.
- **`quantity` es `Decimal` de Prisma.** El dominio **no puede** importar `@prisma/client` (R40),
  así que la cantidad viaja por el borde y por el dominio **como cadena** con hasta 14 dígitos y 4
  decimales —mismo criterio que `cost` en QC-20 (`specs/QC-20-crud-de-productos/design.md > 6.1`)—
  y el **adaptador driven** la convierte a `Prisma.Decimal` al escribir y con `.toFixed(4)` al
  leer. Un `number` sería coma flotante binaria, prohibida (`docs/architecture.md > Dominio` n.º 4
  y su anti-patrón).
- **`createdBy`/`updatedBy` son anulables y sin `@relation`.** El service los escribe siempre con
  el id del actor (R6); la lectura los devuelve tal cual, como identificadores, y `null` es un
  valor válido que significa «no la creó una persona» (R34). Nadie resuelve nombres aquí: eso es
  del contrato de `identity` y alcance de QC-26.

---

## 3. Estructura del módulo `recetas`

```
lib/modules/recetas/
  index.ts                                  # CONTRATO: solo reexporta de ./domain
  domain/
    actor.ts                                # Actor, ADMIN_ROLE_NAME, requireAdmin
    errors.ts                               # RecetasError y sus clases
    page.ts                                 # Page<T>, PageQuery, pageQuerySchema
    recipe-name.ts                          # normalizeRecipeName (YA EXISTE, QC-24)
    recipe-image.ts                         # detectImageFormat + limites (R23)
    recipe-input.ts                         # createRecipeSchema, updateRecipeSchema
    recipe-view.ts                          # RecipeSummary, RecipeDetail, RecipeLineView
    create-recipe.ts  update-recipe.ts  delete-recipe.ts
    get-recipe.ts     list-recipes.ts
  ports/
    recipe-repository.ts
    recipe-image-storage.ts
  adapters/
    driven/persistence/recipe-prisma.ts
    driven/storage/recipe-image-supabase.ts
    driven/config/storage-config-env.ts
    driving/recipe-actions.ts
```

Cada caso de uso es una **factory** `createXxx(deps)` que devuelve la función, igual que en
`inventario`. Es lo que permite testearlo con dobles de los puertos sin base y **sin bucket**
(R43), y es donde vive la decisión (R40): el adaptador driving solo traduce entrada y salida.

**El contrato (`index.ts`)** gana los tipos (`Actor`, `RecipeSummary`, `RecipeDetail`,
`RecipeLineView`, `Page`), los esquemas zod, las clases de error y las cinco factories. Sigue sin
`'use server'`, sin Prisma, sin `next/*` y **sin `@supabase/storage-js`** en su cierre transitivo:
QC-26 lo importará desde un componente de cliente.

`ADMIN_ROLE_NAME` vive en `recetas/domain/actor.ts`, propia, exactamente por el mismo motivo y con
la misma deuda que en `inventario` (QC-20 D23): el contrato de `identity` todavía no exporta la
constante. Cuando la exporte, se importa del **barrel** `@/lib/modules/identity` y se borran las
dos locales. Duplicar el literal hoy es deuda consciente y de una línea.

---

## 4. Autorización (D1 → R1, R2, R3)

```ts
// domain/actor.ts
export const ADMIN_ROLE_NAME = 'Administrador';
export type Actor = { readonly id: string; readonly roleName: string | null };
export function requireAdmin(actor: Actor | null | undefined): asserts actor is Actor;
```

- **Primera línea de los cinco casos de uso**, antes de zod y antes de tocar ningún puerto. El
  test que cierra R2 llama a cada caso de uso con un actor `Operador` y con dobles de los **tres**
  puertos —repositorio, catálogo de productos y almacenamiento— que **fallan si los llaman**: eso
  es lo que demuestra «no llega al repositorio», que es lo que distingue una autorización real de
  un `if` decorativo.
- **Falla cerrado** (R3): `null`, `undefined`, rol vacío o rol desconocido → mismo rechazo.
  Igualdad exacta, sin `includes` ni normalización.
- **Listar y ver el detalle también pasan por aquí** (D1): el Operador ni siquiera consulta.
- La RLS de QC-24 sigue activa y forzada y **no autoriza nada** (Prisma se conecta como dueño de
  las tablas). Es defensa en profundidad; el requisito lo cierra el test de servicio
  (`CHECKPOINTS.md > Datos y seguridad`).

---

## 5. De dónde sale el actor (D22 → R1)

Los casos de uso reciben el actor **por parámetro**. Quien lo resuelve es la Server Action,
pidiéndolo al contrato ya cableado `identity.getSessionUser()` desde `@/lib/composition` y
construyendo `{ id, roleName }` con lo que devuelve `SessionUser`. **QC-8 está `done`**: la sesión
es real (`session-cookie.ts` + `session-user-prisma.ts`), así que el `id` que llega corresponde a
un usuario que existe en `users` y las FK de auditoría se satisfacen. `lib/composition` no conoce
cookies; solo ata puerto → adaptador.

---

## 6. La frontera con `inventario` (D21 → R17)

QC-24 dejó publicado en el contrato de `inventario` **solo los tipos** `ProductId`, `ProductRef` y
`ProductCatalog` (`lib/modules/inventario/domain/product-catalog.ts`), con la implementación
explícitamente pendiente «para QC-25». Esta ficha la escribe:

```ts
// lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts
export const findProductRefs: ProductCatalog['findRefs'] = async (ids) => { /* prisma.product … */ };
```

- Vive en **`inventario`**, que es el módulo propietario del modelo `Product`; `recetas` nunca
  escribe `prisma.product` —lo vigila `tests/guards/guard-arquitectura-modulos.test.ts`—.
- `recetas/domain/*` importa **solo el tipo** desde el barrel `@/lib/modules/inventario` (import
  permitido: barrel de otro módulo, `docs/architecture.md > La regla de dependencias`), y lo
  recibe como dependencia de la factory: `createCreateRecipe({ recipes, products, images })`.
- `lib/composition` cablea `productCatalog = { findRefs: findProductRefs }` y se lo pasa a los
  casos de uso de `recetas`. Es el único sitio donde se juntan los dos módulos.
- **`findRefs` devuelve solo productos vivos** (así lo documentó QC-24). De ahí salió la pregunta
  abierta 7, que el humano cerró en F1.4 (§ 13.3).

**Validación de existencia, con la decisión de la pregunta 7 ya incorporada** (R17, R45, R46). El
caso de uso pide `findRefs` **una sola vez** —nada de una consulta por línea— pero **no sobre todas
las líneas**: solo sobre los **productos nuevos**.

```
idsEnviados      = productIds de la lista final
idsYaEnLaReceta  = productIds de las lineas que la receta YA tiene (vacio en el alta)
idsANuevoValidar = idsEnviados \ idsYaEnLaReceta        // diferencia de conjuntos
findRefs(idsANuevoValidar) → los que no vuelvan se rechazan (R17, R46)
```

- En el **alta**, `idsYaEnLaReceta` es vacío, así que se validan **todas** las líneas: sigue siendo
  imposible crear una receta con un producto inexistente o dado de baja (R46).
- En la **edición**, una línea que ya estaba pasa sin consultar el catálogo, aunque su producto esté
  borrado lógicamente (R45). Es lo que resuelve el choque entre R17 y R18: `ProductCatalog` solo
  devuelve vivos, y sin esta diferencia de conjuntos dar de baja un producto convertiría cada receta
  que lo usa en una receta imposible de editar.
- **`productName` del detalle no cambia**: se pide con `findRefs` sobre **todas** las líneas y el
  producto de baja sale con `productName: null` (§ 7.2, R18). Son dos usos distintos del mismo
  método y conviene no confundirlos: uno **valida**, el otro **decora**.

---

## 7. Puertos, contratos de entrada y salida

### 7.1 Entrada (zod, en `domain/recipe-input.ts`) — R38

```ts
recipeLineSchema = {
  productId: uuid,
  quantity:  string, patron decimal(14,4), > 0            // R14
  unit:      string, trim, min 1                          // R14, R15 (texto libre)
}

createRecipeSchema = {
  name:        string, trim, min 1, max 120,              // R7
               refine: normalizeRecipeName(name) !== ''   // R9
  description: string, trim, max 500, opcional | null     // R7
  steps:       array(string trim min 1 max 1000).max(50), por defecto []   // R19, R20
  lines:       array(recipeLineSchema),
               refine: sin productId repetido             // R16
  image:       { bytes: Uint8Array } | null | omitido     // R21
}
updateRecipeSchema = createRecipeSchema            // reemplazo completo (D16 → R11)
pageQuerySchema    = { page: int >= 1 (def. 1), pageSize: int >= 1 opcional }   // R30
```

La edición es un **reemplazo completo**, no un parche campo a campo: es exactamente lo que dice
D16 para las líneas y lo que QC-20 ya decidió para el producto. `lines` puede venir vacío —una
receta sin líneas es válida: el modelo no lo prohíbe y ninguna decisión lo prohíbe—.

**El campo `image` de la edición tiene TRES estados, y distinguirlos es requisito** (R47): son el
único sitio del borde donde «ausente» y «nulo» significan cosas distintas, y por eso se escribe
aquí explícito en vez de dejarlo a la intuición del implementer.

| Valor de `image` | Qué significa | Qué hace el caso de uso |
| --- | --- | --- |
| omitido (`undefined`) | «no toco la imagen» | conserva `imagePath`; **no llama al almacenamiento** |
| `{ bytes }` | «esta es la nueva» | valida (§ 9.2), sube, persiste la ruta nueva y **borra la anterior** (R26) |
| `null` | «quítala» | persiste `imagePath = NULL` y **borra el archivo que tenía** (R47) |

En el **alta** solo hay dos estados —ausente o `{ bytes }`— porque no hay imagen anterior que
quitar; un `null` en el alta es simplemente «sin imagen» (R21) y no dispara ningún borrado.

### 7.2 Salida

```ts
RecipeSummary  = { id, name, description, imageUrl, stepCount, createdAt, updatedAt,
                   createdBy, updatedBy }                    // SIN lines (D14 → R33)
RecipeLineView = { id, productId, productName, quantity /* string */, unit }
RecipeDetail   = RecipeSummary & { steps: readonly string[]; lines: readonly RecipeLineView[] }
Page<T>        = { items, total, page, pageSize, totalPages }
```

`imageUrl` es `string | null` y se compone **al leer** (R24, § 9.3). `productName` del detalle sale
de `ProductCatalog.findRefs` sobre los ids de las líneas, **no** de un `join` —la tabla es de otro
módulo—; un producto borrado lógicamente no vuelve de `findRefs` y su línea se devuelve igual, con
`productName: null` (R18).

### 7.3 Puerto de persistencia

```ts
export interface RecipeRepository {
  create(data: NewRecipe, actorId: string, now: Date): Promise<{ id: string } | 'duplicate'>;
  findAliveById(id: string): Promise<RecipeRow | null>;
  listAlive(offset: number, limit: number): Promise<{ rows: readonly RecipeRow[]; total: number }>;
  replaceAlive(id: string, data: NewRecipe, actorId: string, now: Date):
    Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(id: string, actorId: string, now: Date): Promise<'ok' | 'not_found'>;
}
```

- **`…Alive` no es adorno**: el filtro `deleted_at IS NULL` es del puerto, no del dominio (R36),
  igual que en `inventario`. Ningún caso de uso puede olvidarlo y no existe operación de restaurar
  ni de listar borradas.
- **Resultados discriminados, no excepciones de Prisma.** El adaptador traduce `23505` →
  `'duplicate'` y `23514` (el `CHECK` de la cantidad) a un error de validación. El dominio nunca ve
  un SQLSTATE. **La unicidad de R10 la garantiza únicamente el índice único**: no hay comprobación
  previa por `nameNormalized`, que sería una carrera (§ 12.4, y es la corrección que QC-20 ya se
  aplicó a sí misma en F2).
- **`replaceAlive` recibe la lista final** y concilia dentro (§ 8). El caso de uso no calcula
  diferencias: la conciliación necesita ser atómica y eso solo puede garantizarlo quien tiene la
  transacción.

---

## 8. La conciliación de las líneas (D16 → R11, R12, R13)

Toda `replaceAlive` corre dentro de **una sola `prisma.$transaction`**:

1. `UPDATE recipes SET … WHERE id = $1 AND deleted_at IS NULL` → si afecta 0 filas, `'not_found'`.
2. `DELETE FROM recipe_lines WHERE recipe_id = $1 AND product_id NOT IN (<ids finales>)` — borrado
   **físico** (R12), que es lo que QC-24 decidió al dejar la línea sin `deleted_at`.
3. Por cada línea final, `upsert` sobre la clave natural `(recipe_id, product_id)`, que ya tiene su
   índice único: inserta la nueva y actualiza cantidad y unidad de la que ya estaba.

Por qué así y no «borrar todas e insertar todas»: el `DELETE`+`INSERT` completo cambia el `id` de
cada línea y su `created_at` en cada edición, y esos datos son de la entidad —QC-24 los pidió
explícitamente (R23 de aquella ficha)—. La clave natural existe precisamente para esto.

Si cualquiera de los tres pasos falla, la transacción revierte entera: es R13, y se verifica
contra Postgres real, no con dobles (§ 14).

**La conciliación no consulta el catálogo de productos, y no es un olvido.** Para cuando la
transacción empieza, el caso de uso ya decidió qué líneas son nuevas y ya las validó contra
`ProductCatalog` (§ 6): el paso 3 hace `upsert` de **todas** las líneas finales, incluida la del
producto dado de baja que la receta ya tenía (R45). La FK a `products` sigue siendo real y sigue
protegiendo del producto **inexistente**; lo que no puede distinguir la base es «vivo» de «borrado
lógicamente», y esa distinción es justo la que R45 y R46 reparten entre líneas nuevas y
preexistentes.

---

## 9. La imagen: puerto, adaptador y configuración

### 9.1 El puerto (D10 → R22)

```ts
// ports/recipe-image-storage.ts
export type RecipeImageUpload = { readonly bytes: Uint8Array; readonly contentType: string;
                                  readonly extension: 'jpg' | 'png' | 'webp' };

export interface RecipeImageStorage {
  /** Sube el archivo y devuelve la RUTA dentro del bucket (`recetas/<uuid>.<ext>`). */
  upload(image: RecipeImageUpload): Promise<string>;
  /** Borra un archivo por su ruta. UNICA operacion de borrado del modulo (R48): la llaman los
   *  DOS caminos —reemplazar (R26) y quitar la imagen (R47)—, y no hay ninguna otra. */
  remove(path: string): Promise<void>;
  /** Compone la URL publica de lectura a partir de la ruta (D5, D6). */
  publicUrl(path: string): string;
}
```

El caso de uso conoce **este** interfaz y nada más: ni `@supabase/storage-js`, ni el nombre del
bucket, ni la URL del proyecto. Los tests le pasan un doble en memoria que registra las llamadas
(R43). El `uuid` del nombre lo genera el **adaptador**, no el dominio: es una fuente de
indeterminismo y no tiene por qué contaminar un caso de uso.

### 9.2 Validación del archivo (D7 → R23)

`domain/recipe-image.ts`, función pura:

- **Tamaño**: `bytes.byteLength > 5 * 1024 * 1024` → rechazo.
- **Formato por contenido**, leyendo los primeros bytes:
  `FF D8 FF` → JPEG; `89 50 4E 47 0D 0A 1A 0A` → PNG; `52 49 46 46 …  57 45 42 50` (`RIFF`…`WEBP`,
  bytes 0–3 y 8–11) → WebP. Cualquier otra cosa → rechazo. Un PDF (`%PDF`), un SVG (`<?xml`/`<svg`)
  o un HEIC (`ftypheic` en el box) fallan aunque el archivo se llame `.jpg` y aunque el cliente
  declare `image/jpeg`. **El `contentType` que envía el cliente no se cree**: se **deriva** de la
  firma detectada, y es el que se manda al bucket.

Por qué a mano y no con una librería (`docs/architecture.md > Dependencias de terceros` obliga a
justificarlo): la alternativa natural es `file-type`, pero detecta ~150 formatos de los que aquí
solo interesan **tres** con firmas fijas y públicas, y su coste real no es el tamaño sino **otra
parada de aprobación humana** (regla 7). Tres comparaciones de prefijo con su tabla de ejemplos en
Vitest son ~15 líneas que no envejecen. Se anota como decisión, no como olvido.

### 9.3 El adaptador y la URL pública (D5, D6 → R24, R25)

`recipe-image-supabase.ts` construye un `StorageClient` de `@supabase/storage-js` con la URL del
proyecto y la credencial que le entrega `storage-config-env.ts`, y:

- `upload` genera `recetas/<uuid>.<ext>`, sube con el `contentType` derivado y devuelve **la
  ruta**. En la columna `image_path` va esa ruta, nunca la URL (D6, R24): cambiar de proyecto o de
  bucket no obliga a migrar ninguna fila.
- `publicUrl(path)` devuelve la URL pública del bucket —composición determinista de la dirección
  del almacenamiento, el bucket y la ruta—. **Sin firma y sin caducidad** (D5, R25): no se llama a
  ninguna API de enlaces firmados. La consecuencia la aceptó el humano con los ojos abiertos y está
  escrita en la decisión: la imagen de una fórmula queda visible para cualquiera con el enlace.
- `remove(path)` borra el objeto. Tiene **dos puntos de llamada y una sola implementación** (R48):
  reemplazar la imagen de una receta viva (R26) y quitarla sin poner otra (R47). **Nunca** al borrar
  la receta (R27).

**Orden de operaciones**, y es deliberado:

| Caso | Secuencia |
| --- | --- |
| Imagen nueva (alta) | `validar → upload → create(… imagePath: nueva)` |
| Imagen nueva (edición) | `validar → upload(nueva) → replaceAlive(… imagePath: nueva) → remove(anterior)` |
| Quitar la imagen | `replaceAlive(… imagePath: NULL) → remove(anterior)` |
| `image` omitido | no se llama al almacenamiento |

En los tres casos el borrado va **después** de que la base confirme. Si la escritura en la base
falla, queda un archivo huérfano (pregunta abierta 3, asumida) pero **nunca** una fila apuntando a
un archivo que no existe, que es lo irreversible.

**Si el `remove` final falla, la edición NO se revierte** (R49, decisión de la pregunta 6). El caso
de uso lo envuelve en un `try/catch` que **no traga nada**: convierte el fallo en una advertencia
con contexto —qué operación y sobre qué ruta— y la devuelve junto al resultado
(`{ id, warnings: readonly StorageWarning[] }`); la Server Action la registra. Nada de `catch`
vacío (`docs/conventions.md > Manejo de errores`), y nada de propagarla como error de la operación:
la receta ya está guardada y correcta, y perder la edición por un archivo que ya no referencia nadie
sería cambiar un huérfano barato por un dato perdido caro. Devolverla como valor —en vez de
escribirla con `console.error` desde el dominio— es además lo que la hace **testeable con un doble
cuyo `remove` rechaza**, sin espiar la consola.

### 9.4 Configuración (D11 → R28)

Tres variables, **declaradas y vacías** en `.env.example`, en su propio bloque documentado:

```
SUPABASE_STORAGE_URL=      # https://<project-ref>.supabase.co  (dirección del proyecto)
SUPABASE_STORAGE_BUCKET=   # nombre del bucket público donde viven las imágenes de receta
SUPABASE_STORAGE_KEY=      # clave con permiso de escritura en ese bucket. SECRETO: nunca al repo
```

Se leen **en el momento de la invocación**, no al importar el módulo, y si falta alguna el
adaptador lanza un error que **nombra las variables que faltan y jamás su valor** —mismo patrón que
`initial-access-credentials-env.ts` de QC-6 (`docs/conventions.md > Manejo de errores`)—. Esto es
lo que hace que la suite pase con las tres vacías (R43): ningún test construye el adaptador real.

**Un apunte honesto sobre D6.** La decisión dice que la dirección del proyecto «ya es variable de
entorno». La única que hay hoy es `SUPABASE_PROJECT_REF`, que `.env.example` declara **para los
servidores MCP** y que, como dice ese mismo archivo, *no se lee de `.env`* sino del entorno del
proceso. Reutilizarla ataría el runtime de la aplicación a una variable de herramientas de
desarrollo. Por eso esta ficha declara `SUPABASE_STORAGE_URL` propia. No contradice D6 —la
dirección sigue siendo configuración y no se persiste en ninguna fila—, pero se deja escrito para
que nadie crea que se pasó por alto.

---

## 10. La dependencia nueva: `@supabase/storage-js` (D9 → R42)

**Aprobada por el humano el 2026-09-03**, al acotar la feature con `/afinar-feature`, y consta en
la fila «Librería nueva» de `requirements.md > Decisiones cerradas (no reabrir)`. Se cita aquí como
exige `CHECKPOINTS.md > Calidad de codigo`.

- **Qué código nos ahorra:** el protocolo HTTP del Storage de Supabase —endpoints de subida y
  borrado, cabeceras de autenticación, `upsert`, `content-type`, códigos de error y composición de
  la URL pública—. Escribirlo a mano con `fetch` sería reimplementar un cliente mantenido y
  quedarse desactualizado en el primer cambio de la API (`docs/architecture.md > Dependencias de
  terceros`, primer párrafo).
- **Los cuatro checks, verificados contra el registro de npm el 2026-09-03** (los verificó el
  humano al acotar; este diseño no vuelve a consultar la red):

  | Check | Resultado |
  | --- | --- |
  | No marcada `deprecated` | **PASA** — sin marca |
  | Release en los últimos 12 meses | **PASA** — publicada el 2026-09-02 |
  | ≥ 10.000 descargas semanales | **PASA** — 25.309.308 |
  | Licencia MIT / Apache-2.0 / BSD / ISC | **PASA** — MIT |

- **Solo el sub-paquete.** No entra `@supabase/supabase-js`. El motivo lo dio el humano y es
  estructural, no de disciplina: sin cliente de datos en el repo, el anti-patrón de
  `CHECKPOINTS.md > Datos y seguridad` —leer o escribir datos de negocio con Supabase en vez de por
  Prisma— es **imposible**, no una promesa que alguien tenga que recordar. Mismo criterio con el que
  QC-19 instaló solo el diccionario y no `zxcvbn` entero.
- **La fila de `docs/dependencias.md` la escribe el leader en F1.4**, y la instalación va después de
  la aprobación del spec. `tests/guards/guard-dependencias-aprobadas.test.ts` falla el gate mientras
  la fila no exista: ese es el orden correcto y no se invierte.

---

## 11. Paginación: se reutiliza, no se reescribe (D12 → R29, R30, R31, R32)

`lib/shared/pagination.ts` ya existe (QC-20 T1) con `DEFAULT_PAGE_SIZE = 10`,
`MAX_PAGE_SIZE = 25`, `toOffsetLimit` y `buildPage`. **`recetas` lo usa tal cual y no añade ni una
línea de aritmética propia** (R31): duplicarlo sería exactamente el error que ese util existe para
evitar.

Detalle de capas, el mismo que en QC-20 y que hay que entender antes de tocarlo: `domain/` **no
puede** importar `lib/shared/**`, así que quien llama al util es el **adaptador driven**, que sí
puede; el caso de uso valida la consulta con zod y delega. El `pageSize` que sale en el `Page` es
el **efectivo ya acotado**, no el que pidió el llamante.

**Orden `name ASC`, sin desempate** (D13, R32), y aquí esta ficha **se aparta de QC-20 D20 a
propósito**: allí el desempate por `id` era obligatorio porque el nombre del producto no es único;
aquí el nombre de la receta **sí lo es** (índice único de QC-24 sobre las vivas), de modo que
`name ASC` ya es un orden total y la paginación es estable sin desempate. Es ausencia decidida, no
olvido, y el test de estabilidad de páginas lo demuestra igual.

---

## 12. Alternativas descartadas

### 12.1 Que el caso de uso hable directamente con Supabase Storage — descartada

Es lo más corto: `storage.from(bucket).upload(...)` dentro de `create-recipe.ts`. Se descarta
porque ataría el dominio a un SDK y a una red: cada test de alta necesitaría bucket o un mock del
módulo, y `domain/` no puede importar un SDK sin romper R40 y la guardia de arquitectura. Con el
puerto, el mismo caso de uso corre con un doble en memoria y la suite no necesita red ni credencial
(R43). Es lo que fija D10 y no se reconsidera.

### 12.2 Guardar la URL completa en `image_path` — descartada por el humano

Consta para que nadie la reintroduzca «porque es más cómodo para la pantalla»: D6 la descarta. La
URL completa mete la dirección del proyecto en cada fila, y cambiar de proyecto, de bucket o de
dominio obliga a migrar datos. Se guarda la ruta y se compone al leer (§ 9.3).

### 12.3 Bucket privado con enlace firmado y temporal — descartada por el humano

**Era la recomendación técnica** y el humano la descartó a conciencia (D5): el bucket es público
porque QC-26 pone la URL en un `<img>` y no quiere pedir nada más. Queda escrito aquí, en el
diseño, lo que eso significa: la imagen de una fórmula es accesible sin sesión para quien tenga el
enlace, y **no se revierte** cambiando el bucket a privado después, porque las URLs ya circularon.
No se implementa ninguna vía de enlace firmado (R25).

### 12.4 Comprobar el nombre duplicado antes de insertar — descartada

Un `SELECT … WHERE name_normalized = …` antes del `INSERT` es una comprobación **no atómica**: dos
altas simultáneas la pasan las dos. La garantía es el índice único parcial de QC-24, y el mensaje
al usuario lo da igual de bien la traducción de `23505` → `'duplicate'` → `DuplicateNameError`. Es
la misma conclusión a la que llegó QC-20 corrigiéndose a sí mismo en F2
(`specs/QC-20-crud-de-productos/design.md > 11.4`), y se hereda ya aprendida.

### 12.5 Borrar todas las líneas e insertarlas de nuevo en cada edición — descartada

Sería tres líneas de adaptador. Se descarta porque destruye el `id` y el `created_at` de cada línea
en cada edición —datos que QC-24 pidió persistir— y convierte una edición que cambia una cantidad
en un borrado masivo. La clave natural `(recipe_id, product_id)` existe justo para permitir el
`upsert` (§ 8).

### 12.6 Exponer operaciones por línea (`añadirLinea`, `borrarLinea`) — descartada por el humano

D16 la descarta: la línea no existe separada de su receta. Además obligaría a versionar o bloquear
la receta para que dos ediciones simultáneas no se pisen, y ningún requisito lo pide. Llega la lista
final completa y el servidor concilia (R11).

### 12.7 Route Handlers en `app/api/` para el CRUD — descartada

Cómodos de probar con `curl`, pero `docs/architecture.md > Server Actions vs Route Handlers`
reserva los route handlers para webhooks, API pública y crons, y D21 lo fija: mutación desde
componente propio → Server Action. Una ruta API interna es además una superficie pública nueva que
habría que proteger aparte (R39).

### 12.8 Validar el formato de la imagen por su extensión o por el `Content-Type` del cliente — descartada

Es lo que hace casi todo formulario y es exactamente lo que D7 prohíbe: los dos datos los controla
quien sube el archivo. Se valida por los bytes (§ 9.2). Coste asumido: la firma no distingue un
JPEG corrupto de uno válido —eso solo lo sabría un decodificador—, y no hace falta: el requisito es
el **formato**, no la integridad.

### 12.9 Borrar el archivo del bucket al borrar la receta — descartada por el humano

D3 la descarta: la fila sigue existiendo con su ruta, y borrar el archivo dejaría un registro vivo
apuntando a nada, que es irreversible. Genera huérfanos a conciencia (pregunta abierta 3). **Sigue
descartada tal cual** después de cerrarse la pregunta 5: los borrados de Storage de esta ficha son
**dos** —reemplazar (R26) y quitar la imagen (R47)—, y los dos ocurren sobre una receta **viva**
cuya fila deja de referenciar ese archivo. Borrar la receta no es ninguno de los dos.

### 12.10 Un segundo camino de borrado con su propia implementación — descartada

Al cerrarse la pregunta 5 aparece la tentación obvia: como «quitar la imagen» es un caso distinto
de «reemplazarla», darle su propio método (`clearImage`, `deleteObject`…) o resolverlo en el
adaptador de persistencia, que ya está tocando la fila. Se descarta y es exactamente lo que R48
prohíbe: dos implementaciones del borrado son dos sitios donde equivocarse de ruta, y el día que
haya que añadir un reintento o un registro de auditoría hay que acordarse de los dos. Un solo
`remove(path)` en `RecipeImageStorage`, dos puntos de llamada en el caso de uso de edición (§ 9.3).

---

## 13. Las tres preguntas que abre este diseño

Estaban escritas en `requirements.md > Preguntas abiertas` como **5, 6 y 7**. **El humano las cerró
el 2026-09-03 en F1.4** y sus decisiones son las tres últimas filas de
`requirements.md > Decisiones cerradas (no reabrir)`: **eso es lo que se implementa.** Confirmó la
posición por defecto en la 6 y la 7, y **la rechazó en la 5**. Lo que queda abajo es la posición
que proponía este diseño, conservada para que se vea qué se descartó y por qué.

### 13.1 Quitar la imagen sin poner otra (pregunta 5) — DESCARTADA

*Posición por defecto, **rechazada por el humano el 2026-09-03**:* sí se puede —el esquema acepta
`image: null` y `imagePath` pasa a `NULL`—, y en ese caso **no** se borra el archivo del bucket,
para no abrir un segundo camino de borrado que D4 no contempla. Consecuencia: un huérfano más.

**Lo que se implementa:** sí se puede quitar la imagen **y el archivo SÍ se borra**. O sea que hay
dos caminos que borran en Storage, y D4 deja de poder llamarse «el único» (queda tachada allí con
su motivo). El diseño lo absorbe **sin duplicar nada**: el borrado ya vive en `RecipeImageStorage`
(§9.1), así que quitar y reemplazar llaman al **mismo** método del **mismo** adaptador, con los
mismos tests. Lo que el argumento de arriba temía —dos implementaciones del borrado, dos sitios
donde borrar el archivo equivocado— no ocurre; lo que sí hay es un segundo punto de llamada.

### 13.2 Si falla el borrado del archivo anterior (pregunta 6) — CONFIRMADA

*Posición por defecto, **confirmada por el humano el 2026-09-03**:* **la edición NO falla.** La
receta ya está guardada y correcta; deshacerla por un archivo que ya no referencia nadie sería
cambiar un huérfano por una edición perdida. El fallo se registra con contexto y se propaga como
aviso, nunca como `catch` vacío (`docs/conventions.md`).

**Lo que se implementa:** lo anterior, y **también para el borrado de la pregunta 5** —quitar la
imagen—, no solo para el del reemplazo. La forma concreta —advertencia devuelta como valor, no
escrita desde el dominio— está en § 9.3, y es lo que cierra **R49**.

### 13.3 Editar una receta con un producto ya dado de baja (pregunta 7) — CONFIRMADA

Es la más cara de las tres y la más fácil de pasar por alto. `ProductCatalog.findRefs` devuelve solo
productos **vivos**; R18 garantiza que la receta **conserva** la línea de un producto borrado; y R17
exige que el producto exista para guardar. Reenviar esa misma línea al editar chocaría con R17 por
un producto que la receta ya tenía.

*Posición por defecto, **confirmada por el humano el 2026-09-03**:* **se admite la línea
preexistente**. El caso de uso de edición lee la receta antes de conciliar (ya lo hace, para conocer
la `imagePath` anterior), y exige `findRefs` **solo para los productos que no estaban ya en la
receta**. Así R17 sigue vigilando lo que importa —no se puede **añadir** un producto inexistente o
dado de baja— y editar la descripción de una receta no obliga a mutilar su fórmula.

**Lo que se implementa:** eso, escrito como diferencia de conjuntos en § 6 y cerrado por **R45**
(se admite la que ya estaba) y **R46** (añadir uno de baja sigue prohibido, y en el alta todas las
líneas son nuevas). El humano añadió el motivo: lo contrario habría convertido dar de baja un
producto en una limpieza en cadena de todas las recetas que lo usan.

---

## 14. Cómo se verifica

**Sin E2E, y con motivo** (D23, R44): esta ficha no tiene pantalla, así que no hay flujo navegable
que visitar. Lo decide QC-26. La verificación es **unitaria y de integración**.

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/recetas/authorization.test.ts` | R1, R2, R3: los cinco casos de uso con actor no administrador rechazan **sin tocar ninguno de los tres puertos**. |
| Unit (dominio) | `tests/unit/recetas/recipe-service.test.ts` | R5, R6, R11, R17, R18, R21, R22, R26, R27, R33, R34, R36, R37 con dobles de los puertos. |
| Unit (dominio) | `tests/unit/recetas/recipe-image-lifecycle.test.ts` | R47, R48, R49: los tres estados de `image` (omitido / nueva / `null`), que los dos caminos de borrado llaman al **mismo** `remove` del puerto, y que un `remove` que rechaza **no** hace fallar la edición y devuelve la advertencia con contexto. |
| Unit (dominio) | `tests/unit/recetas/recipe-lines-catalog.test.ts` | R45, R46: la edición admite la línea preexistente con producto de baja **sin consultar el catálogo por ella**, y rechaza la línea nueva cuyo producto no existe o está de baja; en el alta se validan todas. |
| Unit (borde) | `tests/unit/recetas/recipe-input.test.ts` | R7, R9, R14, R15, R16, R19, R20, R30 (mínimo e integridad), R38: los esquemas zod. |
| Unit (dominio) | `tests/unit/recetas/recipe-image.test.ts` | R23: tabla de firmas —JPEG, PNG, WebP aceptados; PDF, SVG y HEIC renombrados a `.jpg` rechazados— y el corte de 5 MB. |
| Unit (dominio) | `tests/unit/recetas/recipe-image-url.test.ts` | R24, R25: la ruta que se persiste y la URL pública compuesta, sin firma ni caducidad, con un doble del puerto. |
| Unit (driving) | `tests/unit/recetas/recipe-actions.test.ts` | R38, R39: la acción toma el actor de `identity`, valida antes de llamar y traduce errores a estado serializable. |
| Unit (estático) | `tests/unit/recetas/scope.test.ts` | R31, R41, R43, R44: `recetas` no reimplementa la paginación, no altera el esquema, ningún test importa el adaptador de Storage ni la librería, y no hay pantalla, ruta ni spec E2E de recetas. |
| Unit (config) | `tests/unit/recetas/storage-config.test.ts` | R28: las tres variables están **declaradas y vacías** en `.env.example`, el adaptador falla nombrándolas sin filtrar valores, y ninguna dirección, bucket ni clave aparece escrita en `lib/`. |
| Unit (inventario) | `tests/unit/inventario/product-catalog.test.ts` | R17: `findRefs` devuelve solo los vivos y `recetas` valida la existencia por ahí. |
| Integración | `tests/integration/recetas/recipe-crud.int.test.ts` | R5, R10, R12, R13, R29, R30, R32, R35, R36 contra Postgres real: duplicado por SQLSTATE `23505`, líneas conciliadas y transacción que revierte entera, paginación estable, borrado lógico. |
| Integración | `tests/integration/recetas/recipe-lines.int.test.ts` | R14 (`CHECK` de cantidad, `23514`), R16 (`23505` del único `(recipe_id, product_id)`), R18 (producto borrado lógicamente y la línea intacta). |
| Guardia (ya existe) | `tests/guards/guard-arquitectura-modulos.test.ts` | R17 (parte), R31 (parte), R40. |
| Guardia (ya existe) | `tests/guards/guard-rls-force.test.ts` | R4. |
| Guardia (ya existe) | `tests/guards/guard-dependencias-aprobadas.test.ts` | R42. |

El mapa completo `R<n> → test` está en `tasks.md > Trazabilidad`.

Cinco avisos para el implementer, cuatro aprendidos en QC-14, QC-20 y QC-24:

- Los tests de integración necesitan la migración de **QC-24** aplicada; el `beforeAll` debe fallar
  con un mensaje claro si `recipes` o `recipe_lines` no existen, no reventar a mitad del primer
  caso.
- Se afirma sobre el **SQLSTATE** (`23503`, `23505`, `23514`), nunca sobre el texto del mensaje: en
  esta máquina Postgres responde en español.
- Un test de RLS escrito con Prisma sale verde pase lo que pase. No se escribe: R4 lo cierra la
  guardia estática sobre el SQL.
- El test de R2 tiene que demostrar **que no se llega a ningún puerto**, no solo que se lanza un
  error: dobles que registren la llamada y `expect(...).not.toHaveBeenCalled()`.
- **Ningún test afirma nada sobre el censo global del repo** —«hay N modelos», «hay N
  migraciones»—. Tres features lo hicieron y las tres pusieron en rojo a la siguiente
  (`progress/current.md > Deudas y cosas abiertas`). El test de alcance de R41 mira **`recipes` y
  `recipe_lines`**, y nada más; cuando QC-32 migre la unidad a catálogo, actualizará ese test como
  parte de su propio cambio, que es lo correcto.
