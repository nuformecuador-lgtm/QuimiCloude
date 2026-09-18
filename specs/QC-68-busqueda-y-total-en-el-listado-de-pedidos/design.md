# QC-68 — busqueda-y-total-en-el-listado-de-pedidos · design.md

> Escrito el 2026-09-17 sobre el worktree de la rama, al día con `origin/dev` (trae QC-50, QC-63 y
> el arreglo de migraciones). Todo lo que este documento afirma del código está verificado en
> disco, con su archivo y su línea.

---

## 0. El punto de partida, verificado

| Hecho | Dónde |
| --- | --- |
| `ORDER_QUERYABLE.searchable === false`, y el archivo se describe como «la UNICA de las siete con `searchable: false`» | `lib/modules/pedidos/domain/order-queryable.ts:6-7,37` |
| El nombre de la receta lo resuelve el caso de uso con **una** llamada a `RecipeCatalog`, con los ids de la página deduplicados | `lib/modules/pedidos/domain/list-orders.ts:144-151` |
| Los nombres se resuelven con `findRefsIncludingDeleted`, o sea **incluidas las recetas de baja** | `list-orders.ts:149` |
| `pedidos` **no puede** tocar `prisma.recipe`; se comparte servicio vía interfaz | `docs/architecture.md > Dominio` n.º 2; `tests/guards/guard-arquitectura-modulos.test.ts`; `tests/unit/pedidos/scope.test.ts:521,541` |
| Ninguna FK de `orders` lleva `@relation`: no hay relación que navegar con `include` | `db/schema.prisma:485-509`; QC-33 **R33** (el enunciado que el encargo llama «R53»; R53 es el de `scope.test.ts`, que prohíbe `prisma.recipe` en `pedidos` — los dos apuntan a lo mismo) |
| `recipes` ya tiene `company_id` (QC-50) y `name_normalized` | `db/schema.prisma:335,339` |
| Las otras seis listas normalizan el término con `normalizedSearchCondition(query.search, normalize<X>Name)` | `recipe-prisma.ts:319`, `unit-prisma.ts:155`, `supplier-prisma.ts:317`, `product-prisma.ts:207`, `presentation-prisma.ts:358`, `supplier-catalog-line-prisma.ts:510` |
| `pedidos` **ya tiene su copia** de `normalizedSearchCondition`, sin usar | `lib/modules/pedidos/adapters/driven/persistence/list-query-sql.ts:118` |
| `normalizeRecipeName` está en el **contrato público** de `recetas` | `lib/modules/recetas/index.ts:39` |
| El índice de búsqueda de recetas es **PARCIAL**: `WHERE deleted_at IS NULL` | `db/migrations/20260904160000_list_query_indexes/migration.sql:67` |
| `orders_recipe_id_idx` ya existe | `db/schema.prisma:505` |
| **No hay precio unitario en ninguna parte**: `Order` tiene un solo decimal, `quantity` | `db/schema.prisma:485-509`; ver `requirements.md > P1` |

---

## 1. Modelo de datos

**Ninguna tabla cambia de forma.** No se añade columna, no se cambia ningún tipo, no se toca RLS ni
el `/// @module` de ningún modelo. Lo único que entra en la base es **un índice**.

### 1.1 La migración

```
db/migrations/<timestamp>_recipes_search_index_including_deleted/
  migration.sql
  down.sql
```

`migration.sql`:

```sql
CREATE INDEX "recipes_name_normalized_all_trgm_idx"
  ON "recipes" USING gin ("name_normalized" gin_trgm_ops);
```

`down.sql`:

```sql
DROP INDEX IF EXISTS "recipes_name_normalized_all_trgm_idx";
```

**Por qué hace falta un índice más y no vale el que hay** (R19, `[D8]`, `[D2]`). QC-57 creó
`recipes_name_normalized_trgm_idx` **parcial**, con `WHERE deleted_at IS NULL`, porque el listado
de recetas nunca muestra las de baja. Esta búsqueda **sí tiene que verlas** (`[D2]`), así que su
`where` no lleva `deleted_at IS NULL` y el planificador **no puede usar el índice parcial**: un
índice parcial solo sirve a consultas cuyo predicado lo implique. Sin un índice total, la búsqueda
cae en *seq scan* sobre `recipes` — el anti-patrón que `docs/architecture.md > Anti-patrones`
rechaza y que `[D8]` manda evitar con el mismo criterio de QC-57.

**Los dos conviven a propósito**: el parcial sigue sirviendo al listado de recetas (más pequeño y
más barato de mantener), el total sirve a esta búsqueda. Quitar el parcial para dejar solo el total
deoptimizaría una pantalla que ya funciona, y eso no lo pide nadie.

**Sin `company_id` en el índice**, y es deliberado: un GIN compuesto de `(company_id, name_normalized gin_trgm_ops)`
necesitaría la extensión `btree_gin`, o sea **una dependencia de infraestructura nueva** que nadie
ha aprobado. El ámbito de empresa se aplica igual en el `where` (R6), y el trigrama recorta lo
suficiente: el filtro por empresa se resuelve después sobre un conjunto ya pequeño.

**`down.sql` NO hace `DROP EXTENSION pg_trgm`**, mismo criterio escrito en
`db/migrations/20260904160000_list_query_indexes/down.sql:10`: una extensión es infraestructura
compartida y otras seis tablas dependen de ella.

**El índice NO se declara en `db/schema.prisma`**, igual que sus seis hermanos de QC-57: Prisma no
expresa `gin_trgm_ops` sin activar un preview feature, y el repo ya vive con esa drift. Consecuencia
conocida y heredada: toda migración generada después traerá un `DROP INDEX` de éste que **hay que
borrar a mano** antes de aplicarla, exactamente como ya pasa con los otros seis.

### 1.2 Lo que NO entra en la base

- **Ninguna columna `total`.** `[D1]` y QC-33 (pregunta 4 del dominio, cerrada): los cálculos de
  dinero son internos y derivados, no se guardan, para que no puedan contradecir a sus factores
  (R15).
- **Ninguna columna `recipe_name_normalized` en `orders`.** Es la alternativa descartada, `> 4`.
- **Ningún índice sobre el total.** No se ordena ni se filtra por él (`[D1]`, R16).

---

## 2. La frontera entre módulos

`pedidos` no puede leer `recipes`. La regla está en `docs/architecture.md > Dominio` n.º 2 («se
comparten **servicios vía interfaz**, nunca repositorios ni tablas») y la hacen cumplir tres cosas
distintas, todas verdes hoy:

1. `tests/guards/guard-arquitectura-modulos.test.ts` — `prisma.<modelo>` solo en el módulo dueño.
2. `tests/unit/pedidos/scope.test.ts:521` — «pedidos no consulta `prisma.recipe`».
3. `db/schema.prisma` — `orders.recipe_id` es escalar **sin `@relation`**, así que ni siquiera hay
   `include` que escribir (QC-33 R33).

El mecanismo que ya existe para atravesar esa frontera es `RecipeCatalog`
(`lib/modules/recetas/domain/recipe-catalog.ts:24`), implementado por un adaptador driven **de
recetas** y cableado en `lib/composition`. Esta feature **lo amplía con un método**, que es
exactamente el camino previsto.

### 2.1 El método nuevo

```ts
// lib/modules/recetas/domain/recipe-catalog.ts (dentro de la interfaz RecipeCatalog)

/** Identificadores de las recetas de esa empresa cuyo nombre casa con el término,
 *  INCLUIDAS LAS DADAS DE BAJA. `null` = el término no es una búsqueda (no conserva
 *  ningún carácter al normalizarlo): quien pregunta no debe filtrar nada. */
findIdsMatchingName(search: string, companyId: string): Promise<readonly RecipeId[] | null>;
```

**Devuelve ids, no `Ref`s**, y es lo que impide que este método se convierta en un segundo listado
de recetas por la puerta de atrás: quien pregunta no obtiene ni nombres ni fechas, solo la
respuesta a «¿cuáles casan?». Los nombres siguen saliendo de `findRefsIncludingDeleted`, en su
llamada de siempre.

**`| null` y no `[]` para el término vacío** (R9). `[]` significa «ninguna receta casa» → cero
pedidos (R10). `null` significa «esto no es una búsqueda» → la lista entera. Fundir los dos casos
convertiría una búsqueda de solo signos en una lista vacía, que es justo lo contrario de lo que
QC-57 R20 decidió. La distinción es la misma que ya hace `normalizedSearchCondition`, que devuelve
`null` cuando el término se normaliza a vacío
(`pedidos/adapters/driven/persistence/list-query-sql.ts:115-124`).

### 2.2 La implementación, con ámbito de empresa

En `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts`, al lado de
`findRecipeRefsIncludingDeleted` y con su mismo patrón:

```ts
export async function findRecipeIdsMatchingName(
  search: string,
  companyId: string,
): Promise<readonly RecipeId[] | null> {
  const condition = normalizedSearchCondition(search, normalizeRecipeName);
  if (condition === null) return null;

  const scope: RecipeScope = { companyId };
  const rows = await prisma.recipe.findMany({
    where: { AND: [recipeCompanyScope(scope), { nameNormalized: condition }] },
    select: { id: true },
  });

  return rows.map((row) => row.id);
}
```

**Nota de ámbito de empresa — lo que `guard-ambito-empresa-recetas.test.ts` exige y cómo se
cumple.** La guardia (leída entera, `tests/guards/guard-ambito-empresa-recetas.test.ts:412-473`)
no se conforma con la firma. De **cada** método de `RecipeCatalog` comprueba **cuatro** cosas:

1. Que el método está **cableado con nombre** en `lib/composition/index.ts` y que el conjunto de
   claves del objeto cableado es **exactamente igual** al de los métodos de la interfaz — así que
   añadir el método a la interfaz **sin cablearlo pone la guardia en rojo sola**, sin que nadie
   tenga que acordarse.
2. Que la **interfaz** declara `companyId: string` en la firma.
3. Que la **implementación** lo declara también. TypeScript no lo exige: una función de menor
   aridad satisface la firma, y esa es la fuga que la guardia existe para cerrar.
4. Que ese valor **llega** hasta una envoltura de `./company-scope`. El patrón admitido —y el que
   se usa arriba— es el de `findRecipeRefsIncludingDeleted`: envolver `companyId` en un
   `RecipeScope` local y pasárselo a `recipeCompanyScope(scope)`. La guardia sigue ese salto
   (`lePasaElAmbito`, línea 191). Leer `scope.companyId` a mano está **prohibido** fuera del punto
   único (`LECTURA_SUELTA`, línea 235).

Es decir: **no hay que escribir ninguna guardia nueva**. La que existe se tensa sola con el método
nuevo, que es la señal de que el diseño va por el camino previsto. Lo que sí hay que hacer es
cablear (`T6`), o nada compila ni pasa.

**Sin `deleted_at IS NULL` en el `where`**, igual que su hermana de al lado y por el mismo motivo
escrito ahí (`recipe-catalog-prisma.ts:18-22`): un pedido conserva su receta aunque la den de baja
y la lista ya enseña ese nombre. Si al buscar ese mismo nombre el pedido no saliera, parecería
perdido — que es literalmente lo que dice `[D2]`.

**La normalización se reutiliza, no se inventa** (R2): `normalizeRecipeName` es la misma función
que escribió `recipes.name_normalized` y la misma con la que `recetas` mide «mismo nombre».
`normalizedSearchCondition` es la misma función que usan las otras seis listas — y `recetas` ya la
tiene importada en su `list-query-sql.ts` local.

---

## 3. El flujo del listado

`lib/modules/pedidos/domain/list-orders.ts` conserva su orden y gana **un paso entre el 4 y el 5**:

```
1. requirePermission(actor, 'pedidos.consultar')        ← sin cambios (R17, [D6])
2. scope = { companyId: actor.companyId }               ← sin cambios (R17, [D6])
3. zod                                                   ← sin cambios
4. sanitizeListQuery(parsed, ORDER_QUERYABLE)            ← ahora `search` SOBREVIVE (R11)
   + pruneClosedSelects + log                            ← sin cambios
5. NUEVO: si `search !== ''`
        recipeIds = await deps.recipes.findIdsMatchingName(search, actor.companyId)
   si no  recipeIds = null
6. await deps.orders.listAlive(query, scope, recipeIds)  ← firma con un parámetro más
7. await deps.recipes.findRefsIncludingDeleted(ids, ...)  ← sin cambios
8. toOrderView por fila                                   ← sin cambios
```

**Número de consultas por página** (R8): **3 sin búsqueda** (`findMany` + `count` + catálogo de
nombres) y **4 con búsqueda**. Constante: no crece con las filas. El molde es
`lib/modules/asignaciones/domain/list-assigned-orders.ts:69-95`, que ya hace exactamente esto —
pedir primero los identificadores a otro módulo y después la página— y cuyo test cuenta
invocaciones en vez de mirar el resultado.

**El caso «ninguna receta casa» NO se cortocircuita en el dominio.** Se pasa `recipeIds: []` al
repositorio y el `where` sale con `recipeId: { in: [] }`, que devuelve cero filas y un `count` de
cero. Es una consulta más barata que la lista completa y mantiene **una sola** aritmética de
paginación: construir la página vacía a mano en el dominio sería reimplementar
`toOffsetLimit`/`buildPage`, que QC-34 **R37** prohíbe explícitamente y que `domain/` ni siquiera
puede importar. (`list-assigned-orders.ts` sí la construye a mano, y por eso tiene su propio
`effectivePageSize`: aquí no hace falta pagar ese precio.)

### 3.1 El puerto y el adaptador de pedidos

`lib/modules/pedidos/ports/order-repository.ts`:

```ts
listAlive(
  query: ListQuery,
  scope: OrderScope,
  recipeIds: readonly string[] | null,
): Promise<Page<OrderRow>>;
```

`recipeIds` es **parámetro propio y no viaja dentro de `ListQuery`**: `ListQuery` es la forma
*compartida* por los siete listados (`domain/list-query.ts:5-15`, duplicada a propósito en los
cinco módulos y vigilada por `guard-contrato-listados`), y meterle un campo que solo pedidos
entiende obligaría a tocar las cinco copias y a que la guardia canónica lo aceptara. El contrato
genérico no cambia. **Nadie más llama a `listAlive`** por el puerto: el único consumidor es
`list-orders.ts`.

**El puerto lo exige; la función del adaptador lo declara con `= null` por defecto.** No es una
concesión: `listAliveOrders` tiene **más de treinta llamadas directas** en los tres archivos de
integración de pedidos (`order-repository.int.test.ts`, `list-query-orders.int.test.ts`,
`company-scope-queries.int.test.ts`, todas con dos argumentos), y un tercer parámetro obligatorio
las rompería todas sin que ninguna de ellas hable de búsqueda. Lo que **no** se relaja es el
contrato: la interfaz `OrderRepository` lo declara **obligatorio**, así que el dominio no puede
olvidarlo, y `null` significa exactamente «sin búsqueda», que es el estado de esas treinta
llamadas.

`buildOrderWhere(query, scope, recipeIds)` gana **un tercer término del `AND`**, al mismo nivel que
el ámbito y el borrado, nunca fundido con los filtros ni con ningún `OR` (R6):

```ts
return {
  AND: [
    orderCompanyScope(scope),
    { deletedAt: null },
    ...(recipeIds === null ? [] : [{ recipeId: { in: [...recipeIds] } }]),
    ...filters,
  ],
};
```

El mismo objeto sirve al `findMany` y al `count` — literalmente la misma constante, como ya hace
`listAliveOrders` (`order-prisma.ts:461-472`) —, así que el `total` describe el conjunto **ya
buscado** (R5).

**El adaptador de pedidos sigue sin llamar a `normalizedSearchCondition`**: `orders` no tiene
columna de nombre y no la gana. La copia de `list-query-sql.ts` se queda como está, por el motivo
que su propia cabecera ya explica (las tres copias son la misma y podarla las haría divergir); lo
que hay que corregir es la **razón escrita** en esa cabecera, que dice
«`ORDER_QUERYABLE.searchable === false`» y deja de ser cierta (T15).

---

## 4. Alternativa descartada: denormalizar el nombre de la receta en `orders`

**En qué consistía.** Añadir `orders.recipe_name_normalized`, escribirla en el alta y en la
edición del pedido, poblarla con un backfill, indexarla con un GIN de trigramas y buscar con un
`contains` sobre la propia tabla `orders`. Una sola consulta, sin cruzar módulos en tiempo de
lectura, y sin lista de identificadores que crezca.

**Por qué se descarta.**

1. **Una copia que se queda vieja, y no hay quien la refresque sin romper la frontera.** Renombrar
   una receta tendría que reescribir la columna de **todos** los pedidos de esa receta. Quien
   renombra es `recetas`, y `recetas` **no puede escribir en `orders`**: sería exactamente el
   `prisma.order` fuera de su módulo que `guard-arquitectura-modulos` rechaza. La alternativa sería
   un evento o un job, y en este repo **no existe** ninguno de los dos: montarlo es una feature
   propia, no un detalle de ésta.
2. **La lista mentiría.** El listado ya muestra el nombre **vivo** de la receta, resuelto en cada
   consulta (`list-orders.ts:149-151`). Con la columna desincronizada, buscar «buffer» no
   encontraría un pedido cuya fila **dice** «buffer» en pantalla. `docs/architecture.md > Dominio`
   n.º 3 («los datos son el producto») y el propio `[D2]` van justo en contra de eso.
3. **Indexa la tabla que crece.** `orders` es transaccional y crece sin techo; `recipes` es un
   catálogo. Poner el GIN de trigramas en la tabla grande —y mantenerlo en cada alta y cada
   edición de pedido— cuesta más que consultar un catálogo pequeño que **ya** tiene su columna
   normalizada desde QC-24 y su empresa desde QC-50.
4. **Backfill con pérdida potencial.** La columna nacería `NOT NULL` sobre una tabla con datos, y
   el nombre de una receta **borrada físicamente** no se podría recuperar. La opción elegida no
   tiene ese problema: el `null` de `recipeName` ya está contemplado en `OrderView`.

**Lo que se paga por descartarla**, dicho para que no se revierta sin datos: **una consulta más por
página** cuando hay búsqueda, y una lista de identificadores en el `IN` acotada por el catálogo de
recetas de la empresa (ver `requirements.md > P2`).

### 4.1 Segunda alternativa descartada: `include` / `join` de Prisma

Declarar `@relation` entre `Order` y `Recipe` y filtrar con `where: { recipe: { nameNormalized: ... } }`
sería una línea. Está **prohibido de tres maneras a la vez**: QC-33 R33 exige que las referencias
del pedido sean escalares sin relación precisamente para que el ORM no pueda atravesar,
`guard-arquitectura-modulos` lo rechaza como acceso a un modelo de otro módulo, y el propio
encargo lo veta. No se evalúa más.

---

## 5. El total

**Bloqueado por `requirements.md > P1`**: no existe hoy el segundo factor. Lo que sí queda decidido,
para cuando P1 se responda:

- **Se calcula en el adaptador driven**, no en el dominio: multiplicar dos `Decimal(14,4)` exige
  `Prisma.Decimal`, y `domain/` no puede importar `@prisma/client`
  (`docs/architecture.md > La regla de dependencias`). El adaptador ya hace esta conversión en
  los dos sentidos (`toDecimalRange`, `.toFixed(4)`).
- **Viaja como cadena** con `.toFixed(4)`, igual que `quantity` (R13). `OrderRow` gana
  `total: string` y `OrderView`/`OrderSummary` lo arrastran; `toOrderView` (`get-order.ts`) lo
  copia. Así la ficha y el listado no pueden diverger, que es la razón por la que `OrderSummary`
  es un alias y no una copia recortada (`order-view.ts:97-101`).
- **Sin dependencia nueva** (R14): Prisma ya opera decimales. `decimal.js` **no entra**, y
  `tests/unit/pedidos/scope.test.ts:284` (lista cerrada `zod` + `@prisma/client`) lo haría caer
  solo si alguien lo intentara.
- **Fuera de `ORDER_QUERYABLE`** (R16, `[D1]`): no se añade a `sortable` ni a `filterable`. Pedir
  orden por `total` cae por el `default` de `orderOrderBy` como cualquier campo desconocido y se
  anota en el log — el mismo camino por el que salió `unitPrice` en QC-35bis.
- **No se persiste** (R15).

---

## 6. Dependencias de terceros

**Ninguna.** La feature no propone ni una. Si al responder P1 alguien creyera necesitar una
librería de decimales, la respuesta ya está escrita en `[D7]`: Prisma opera decimales y el cálculo
vive en el adaptador. Los cuatro checks de `docs/architecture.md > Dependencias de terceros` no se
aplican aquí porque no hay candidata.

---

## 7. Contratos de entrada y salida

**Entrada**: no cambia ni una clave. `search` ya existe en el contrato genérico
(`ListQuery.search`, `''` = sin búsqueda) y ya viaja desde la Server Action; lo único que cambia es
que **deja de podarse** (R11).

**Salida**: `OrderSummary` gana `total: string` cuando P1 se responda (R12). Nada más. `recipeName`
sigue siendo `string | null` con el mismo significado.

**Rutas y endpoints**: ninguno nuevo. La Server Action `listOrders`
(`lib/modules/pedidos/adapters/driving/order-actions.ts`) no cambia de firma.

**Multiplataforma**: no aplica, no hay UI en esta feature (`[D3]`).

---

## 8. Archivos que la feature va a tocar

Para el cruce de F1.4 con **QC-59** (`backend`, módulo `proveedores`) y **QC-91** (`fullstack`,
inventario/lotes).

### Producción

| Archivo | Qué |
| --- | --- |
| `lib/modules/pedidos/domain/order-queryable.ts` | `searchable: true` + limpieza de comentarios de las líneas tocadas |
| `lib/modules/pedidos/domain/list-orders.ts` | paso 5 (resolver ids) y llamada a `listAlive` |
| `lib/modules/pedidos/ports/order-repository.ts` | firma de `listAlive` |
| `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts` | `buildOrderWhere` + `listAliveOrders` (+ total, bloqueado por P1) |
| `lib/modules/pedidos/adapters/driven/persistence/list-query-sql.ts` | **solo comentario**: la razón escrita deja de ser cierta |
| `lib/modules/pedidos/domain/order-view.ts` | `total` en `OrderRow`/`OrderView` — **bloqueado por P1** |
| `lib/modules/pedidos/domain/get-order.ts` | `toOrderView` copia `total` — **bloqueado por P1** |
| `lib/modules/recetas/domain/recipe-catalog.ts` | método `findIdsMatchingName` |
| `lib/modules/recetas/adapters/driven/persistence/recipe-catalog-prisma.ts` | implementación con ámbito |
| `lib/composition/index.ts` | cablear el método nuevo en `recipeCatalog` |
| `db/migrations/<ts>_recipes_search_index_including_deleted/migration.sql` | índice nuevo |
| `db/migrations/<ts>_recipes_search_index_including_deleted/down.sql` | su reverso |
| `app/(private)/pedidos/components/order-list-params.ts` | **solo comentario**: la razón de emitir `search` vacío cambia |
| `app/(private)/pedidos/components/order-table.tsx` | **solo comentario**: ídem |

> **`lib/composition/index.ts` es el único archivo con riesgo real de colisión** con otra ficha en
> curso: es el punto único de cableado y cualquier feature que añada un puerto lo toca. El resto
> vive en `pedidos`, en `recetas` y en `db/migrations/`, y **no se solapa** con `proveedores`
> (QC-59) ni con inventario/lotes (QC-91). Las dos migraciones nuevas que puedan coincidir en el
> tiempo no chocan entre sí: son carpetas distintas.

### Tests (censos y cobertura)

`tests/unit/shared/listas-blancas-listados.test.ts`, `tests/unit/pedidos/order-view.test.ts`,
`tests/unit/pedidos/order-input.test.ts`, `tests/unit/pedidos/list-orders.test.ts`,
`tests/unit/pedidos-ui/order-list-params.test.ts`,
`tests/integration/pedidos/list-query-orders.int.test.ts`,
`tests/integration/inventario/list-query-indexes.int.test.ts`,
`tests/unit/recetas/recipe-catalog.test.ts`, `e2e/pedidos.spec.ts` (**solo un comentario**).
El detalle, archivo por archivo, en `tasks.md`.

---

## 9. Verificación

`[D3]`: **no hay E2E en esta ficha** y no se añade ninguno — la lista de specs E2E de pedidos es un
censo cerrado de tres (`tests/unit/pedidos/scope.test.ts:402-406`) y un cuarto sin ficha que lo
respalde la pondría en rojo. La cobertura es:

- **Unitaria** para el flujo del caso de uso (conteo de invocaciones, no solo resultado) y para la
  lista blanca.
- **Integración contra la base real** para lo que un doble no puede demostrar: que la búsqueda se
  traduce a SQL, que el `total` describe el conjunto buscado, que una receta de baja entra, que el
  ámbito de empresa no se amplía, y que el índice nuevo existe con su definición exacta.
- **Guardias**: `guard-ambito-empresa-recetas` y `guard-arquitectura-modulos` se tensan solas con
  el método nuevo; no se escribe ninguna guardia adicional.

Cierre de tanda con `./init.sh --rapido`; cierre de feature y PR con `./init.sh` completo.
