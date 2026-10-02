# QC-50 — aislamiento-por-empresa-en-recetas · design.md

> Cómo se construye lo que `requirements.md` pide. El **Alcance** y la tabla de **decisiones
> cerradas** los fijó el humano el 2026-09-16 y aquí **no se reabren**: lo que sigue es *cómo* se
> cumplen, no *si* se cumplen.
>
> Precedentes que mandan, y son dos: **QC-49** (`specs/QC-49-aislamiento-por-empresa-en-inventario/`)
> y **QC-60** (`specs/QC-60-aislamiento-por-empresa-en-pedidos/`), de la misma épica. Ocho de las
> dieciséis decisiones se heredan de ellas y lo dicen por escrito, así que aquí se copian sus
> soluciones en vez de reinventarlas y solo se argumenta lo que es **propio de recetas**: las tres
> costuras entre módulos y el relevo del índice único de nombre.

## 0. Hallazgos

Medidos en disco, dentro de este worktree, el 2026-09-16.

### 0.1. Ninguna contradicción con las decisiones cerradas

Reviso las dieciséis y **ninguna choca con el código**. Lo que sigue es lo que hay que saber antes de
leer el resto, no objeciones. Tampoco hay nada que me obligue a contradecir una decisión: no hay
hallazgo que reportar al leader por esa vía.

### 0.2. El estado real de las dos tablas

- `db/schema.prisma:327-345`, modelo `Recipe`: **no hay `companyId`**. Dos índices de auditoría
  (`recipes_created_by_idx`, `recipes_updated_by_idx`), borrado lógico (`deletedAt`), y el `///` ya
  avisa de que `recipes_name_unique` y los índices de búsqueda **viven en las migraciones** porque
  Prisma no modela índices parciales ni GIN.
- `db/schema.prisma:351-366`, modelo `RecipeLine`: **no hay `companyId`** y **no lo gana** (decisión
  2). Única FK con `@relation`: `recipe_lines.recipe_id → recipes(id)` `ON DELETE CASCADE`.
  `productId` y `unitId` **no tienen `@relation`** y su FK está escrita a mano —son de otros módulos—.
  Únicos: `(recipe_id, product_id)`; índices por `product_id` y por `unit_id`.
- `db/migrations/20260902163256_recipes_and_recipe_lines/migration.sql:103`:
  `CREATE UNIQUE INDEX "recipes_name_unique" ON "recipes"("name_normalized") WHERE "deleted_at" IS
  NULL`. **Global y parcial**, las dos cosas. El relevo de §2.2 tiene que conservar la parcialidad.
- `:116` y `:118` del mismo archivo: `recipes` y `recipe_lines` ya están `ENABLE` + `FORCE ROW LEVEL
  SECURITY`, sin ninguna policy. Eso es exactamente la mina que QC-49 documentó: bajo `FORCE` y sin
  policy, Postgres deniega **también al dueño**, con quien conecta Prisma. La migración de esta ficha
  lee y escribe `recipes`, así que abre y cierra el mismo paréntesis `NO FORCE` / `FORCE` (§7.1).
- Base de desarrollo (dato del encargo, no lo vuelvo a medir): **5 recetas vivas, 5 líneas, 0 fotos**;
  todos los productos usados son de QuimiCloud; **todas** las unidades usadas son de sistema
  (`company_id IS NULL`); **3 pedidos** apuntan a **1 sola receta**; **ningún nombre repetido**, así
  que el relevo del único no choca con ningún dato existente.

### 0.3. Los puntos de consulta de hoy, contados

Siete, en dos archivos:

- `recipe-prisma.ts`: `createRecipe` (`create` anidado con las líneas), `findAliveRecipeById`,
  `buildRecipeWhere` (compartido por el `findMany` y el `count` de `listAliveRecipes`),
  `replaceAliveRecipe` (`updateMany` + `deleteMany` de líneas + `upsert` por línea) y
  `softDeleteAliveRecipe`.
- `recipe-catalog-prisma.ts`: `findRecipeRefsIncludingDeleted`.

**No hay SQL crudo en este módulo** —a diferencia de `pedidos`—: `list-query-sql.ts` solo contiene
ayudantes que construyen condiciones de Prisma. Eso simplifica §5: todo se compone con
`Prisma.RecipeWhereInput`.

### 0.4. El actor de `recetas` todavía no lleva empresa

`lib/modules/recetas/domain/actor.ts:10-13`: `Actor = { id, permissions }`.
`recipe-actions.ts:92-96`: `currentActor()` llama **solo** a `getSessionUser()`, y **sin**
`runInRequestScope`. En cuanto gane la empresa entra en el supuesto de **QC-104** (§4.1 y §8).

### 0.5. Las tres costuras, y quién dejó escrito que se cierran aquí

Esto es el corazón de la ficha, y no es interpretación mía: está escrito en el código con nombre y
apellido.

| Costura | Dónde | Qué dice hoy |
| --- | --- | --- |
| `ProductCatalog.findRefs` | `inventario/.../product-catalog-prisma.ts:15-31` | «ESTE ARCHIVO SE QUEDA SIN AMBITO DE EMPRESA… **ADONDE VA: QC-50**… reutiliza `./company-scope`» |
| `UnitCatalog.findRefs` | `unidades/.../unit-prisma.ts:144-149` | «`findUnitRefs` se queda SIN ambito… destino nombrado: **QC-50**… acota su consulta con ESTA función» |
| `RecipeCatalog.findRefsIncludingDeleted` | QC-60 `requirements.md` R32 y su *Pregunta abierta 1* | «la ventana pedido → receta queda abierta **hasta QC-50**» |

Y hay una cuarta pieza que también lo dice: `tests/guards/guard-ambito-empresa-inventario.test.ts:74`
mantiene `SIN_AMBITO_POR_DECISION_APROBADA = new Set(['findProductRefs'])` con un mensaje que reza
«quítalo de la lista (R29 se cerró en QC-50)». Esta ficha lo vacía (§6.1).

### 0.6. Las listas cerradas que esta ficha tensa, y una que QC-60 solo vio en el gate completo

Cinco, y **cada una es una task explícita** (§8.3), no un efecto colateral:

1. `tests/integration/inventario/list-query-indexes.int.test.ts:155`, `PRE_EXISTING_INDEXES`, contiene
   `'recipes_name_unique'` (`:174`). Con el relevo de §2.2 ese índice **deja de existir**, así que
   sale de la lista **con su comentario de relevo** y entra un caso propio que afirma el compuesto,
   exactamente como hicieron QC-49 con `presentations_name_normalized_key` (`:156-164`, `:296-302`) y
   QC-76 con `units_name_normalized_key` (`:165-173`). Si solo se quitara de la lista, el catálogo se
   quedaría sin quien afirme que hay alguna unicidad.
2. `tests/guards/guard-identificador-de-request.test.ts:57`, `E2E_ESPERADOS`: el spec nuevo se nombra a
   mano, con su motivo, como se nombró `aislamiento-pedidos.spec.ts` (`:59-67`).
3. El mismo archivo, `MIGRACIONES_ESPERADAS` (`:151-158`): la migración nueva se nombra a mano, como
   `20260915120000_orders_company_scope` (`:155-158`).
4. **`tests/unit/recetas/scope.test.ts`, y es la que QC-60 no tuvo que mirar.** Dos listas cerradas
   ahí dentro se rompen con esta ficha: `EXPECTED_RECIPE_FIELDS` (`:331-347`), que compara campo a
   campo el `model Recipe` y cae en cuanto entre `companyId` y el `@@unique`/`@@index` nuevos; y el
   censo de E2E de recetas (`:200-203`), que es un `toEqual` **cerrado** sobre los `e2e/*.spec.ts`
   cuyo nombre case con `/recet|recipe/i` — y `aislamiento-recetas.spec.ts` casa. Es el equivalente de
   lo que a QC-60 se le escapó hasta el gate completo.
5. `tests/integration/aislamiento.json`: todo archivo nuevo de `tests/integration/**` se declara ahí
   con su forma de aislamiento, y lo vigila `guard-aislamiento-integracion`.

### 0.7. El reconocimiento del nombre duplicado sobrevive al relevo, y hay que decirlo

`recipe-prisma.ts:132-160` reconoce el duplicado por `error.meta.target`, comprobando que **incluye**
la columna `name_normalized` (verificado empíricamente en QC-25 T14). Con el índice compuesto el
`target` pasa a ser `['company_id', 'name_normalized']`, y `includes('name_normalized')` **sigue
siendo cierto**: el reconocimiento no se rompe y la constante no cambia. No es suerte: es la razón por
la que QC-25 comparó por columna y no por nombre de índice. R11 lo fija con un test que lo demuestra
contra Postgres real, para que deje de ser una deducción.

## 1. Panorama: qué se mueve y qué no

| Capa | Qué cambia |
| --- | --- |
| Base + Prisma | `recipes.company_id` NOT NULL, FK, relevo del único de nombre a `(empresa, nombre)` parcial, backfill (§2) |
| Dominio | `Actor` gana `companyId`; nace `RecipeScope`; el puerto y el catálogo exigen el ámbito en la firma (§4) |
| Adaptador driven | **un único punto** donde se escribe «de la empresa», y las siete operaciones lo componen (§5) |
| Adaptador driving | `currentActor()` pide **las dos caras** de la sesión dentro de `runInRequestScope` (§4.1) |
| Frontera con `inventario` | `ProductCatalog.findRefs` gana la empresa y muere la excepción de QC-49 R29 (§6.1) |
| Frontera con `unidades` | `UnitCatalog.findRefs` gana la empresa, con la semántica «o de sistema» de QC-76 (§6.2) |
| Frontera con `pedidos` | `RecipeCatalog.findRefsIncludingDeleted` gana la empresa; sus cuatro llamantes ya la tienen (§6.3) |

Lo que **no** se mueve: `recipe_lines` (ni columna, ni FK nueva, ni índice nuevo), el contrato genérico
de consulta (QC-57), el orden por defecto, la búsqueda por trigramas, la paginación, la forma de todos
los resultados públicos, el borrado lógico, el `CHECK recipe_lines_quantity_positive`, el editor de
pasos (QC-62/QC-64) y **el almacenamiento de imágenes** (R27, decisión 5).

**La frontera es el service, no la RLS.** Prisma conecta como dueño de las tablas y no setea
`request.jwt.claims`: ninguna policy filtra nada. La RLS se conserva activada y forzada como defensa en
profundidad (R5, R30). Es la decisión cerrada 12.

## 2. Modelo de datos

### 2.1. La columna

```
recipes.company_id  UUID NOT NULL  REFERENCES companies(id) ON DELETE RESTRICT ON UPDATE CASCADE
```

- **Obligatoria** (R1). No hay «receta de sistema» que justifique la columna opcional de QC-76.
- `ON DELETE RESTRICT`: `companies` tiene borrado lógico (QC-47), así que R29 se cumple sin hacer nada;
  el `RESTRICT` deja escrito que un borrado físico no puede dejar recetas huérfanas.
- En `db/schema.prisma` va como **escalar sin `@relation`**, como `createdBy`/`updatedBy` y por el
  mismo motivo que ya escribe su `///`: con `@relation`, el cliente Prisma dejaría hacer
  `include: { company: true }` desde `recetas` —una lectura de `identity` que ninguna guardia de
  imports ve—. **La FK va escrita a mano en el `migration.sql` y es drift** (R8, riesgo 1 de §12).

**`recipe_lines` no gana nada** (R2, decisión 2). Su empresa es la de su receta, y eso no es una
promesa del código sino una consecuencia del esquema que ya existe: una línea **solo** se alcanza por
su `recipe_id`, su FK es `ON DELETE CASCADE` y ninguna consulta del repositorio la lee sin pasar por la
receta. Dos columnas que pudieran contradecirse serían peor que una. Es donde esta ficha **se aparta a
conciencia de QC-49 D2**, que sí dio columna al lote porque QC-81 necesitaba la unicidad
`(empresa, lote)`; aquí no hay ninguna necesidad parecida.

### 2.2. El relevo del índice único de nombre

```sql
-- fuera el GLOBAL parcial de QC-24
DROP INDEX "recipes_name_unique";

-- la unicidad pasa a medirse dentro de la empresa, y SIGUE SIENDO PARCIAL (R10)
CREATE UNIQUE INDEX "recipes_company_name_unique"
  ON "recipes" ("company_id", "name_normalized")
  WHERE "deleted_at" IS NULL;
```

Patrón literal de **QC-49** con `presentations_name_normalized_key` → `presentations_company_name_unique`,
con **una diferencia que no se puede perder de vista**: el de presentaciones era total y éste es
**parcial**. Si el `WHERE "deleted_at" IS NULL` no se copia, la unicidad pasa a alcanzar también a las
recetas borradas y **R10 deja de cumplirse en silencio** —el nombre dejaría de liberarse al dar de
baja—, que es exactamente lo que avisa el comentario de la migración de QC-24
(`20260902163256_recipes_and_recipe_lines/migration.sql:100-102`).

- **No hace falta `recipes_company_id_idx` aparte** (R9): el único nuevo lleva `company_id` **de
  cabeza**. Es el mismo criterio con el que QC-49 dejó `presentations` sin índice propio. El índice es
  parcial, así que no sirve para la verificación del `RESTRICT` sobre recetas borradas; con 5 filas eso
  es un `seq scan` que ya gana. Coste aceptado y anotado (§12).
- **Prisma sigue sin poder modelarlo**: es parcial, así que **no** se declara `@@unique` en el esquema
  —hacerlo cambiaría la semántica y la unicidad alcanzaría también a las borradas— y el índice vive
  **solo** en el `migration.sql`, igual que hoy. Qué sí y qué no entra en `db/schema.prisma`, en §2.3.

### 2.3. Qué se declara en `db/schema.prisma` y qué no

- `companyId String @map("company_id") @db.Uuid`, **sin `@relation`** (§2.1).
- **Ningún `@@unique`**: el único de nombre es parcial y no se puede expresar (§2.2). El `///` del
  modelo ya dice que ese índice vive en las migraciones; se amplía para nombrar el nuevo y el drift de
  la FK.
- **Ningún `@@index([companyId])` adicional**: sería un segundo índice sobre la misma columna de
  cabeza, y Prisma lo crearía de verdad. Lo que se escribe en el `///` es que la columna está indexada
  por `recipes_company_name_unique`, que Prisma no ve. R9 lo prueba contra `pg_indexes`, no contra el
  esquema.

### 2.4. Nada de disparadores, y por qué

QC-49 tuvo que escribir dos funciones plpgsql para «el lote es de la empresa de su producto» y «la
unidad es de su empresa o de sistema». **Aquí no se escribe ninguna**, y es deliberado:

- `recipe_lines.product_id` y `.unit_id` **no tienen FK** —son de otros módulos, y el esquema ya lo
  dice por escrito—, así que no hay una restricción declarativa a la que colgarse.
- La línea **no tiene empresa propia** (decisión 2), de modo que un disparador tendría que hacer un
  `JOIN` a `recipes` por cada fila escrita, solo para comparar con otra tabla de otro módulo.
- Y sobre todo: **la decisión cerrada 3 dice dónde está la frontera, y dice «el service»**. Un
  disparador sería defensa adicional, no la frontera; es la alternativa **B** de §11, con su porqué.

## 3. Cómo llega el `companyId` hasta el caso de uso y el repositorio

Sin que `recetas/domain/**` importe sesión, cookie ni `next/*`. Es la respuesta de QC-49 §4 y QC-60
§4, verificada contra el código de esta rama.

### 3.1. El actor lo trae, y lo rellena el adaptador driving

```ts
export type Actor = {
  readonly id: string;
  readonly companyId: string;          // NUEVO
  readonly permissions: readonly string[];
};
```

Va **dentro del actor** y no como parámetro suelto de cada caso de uso: viaja siempre junto a los
permisos, así que ningún llamante nuevo puede olvidarse de pasarla ni —peor— **elegirla**.
`actor.ts` ya importa del barrel de `identity`; **no se añade ningún import nuevo**.

`recipe-actions.ts` construye el actor con **las dos caras** de la sesión, y **dentro de
`runInRequestScope`**, exactamente como `order-actions.ts:121-132` (QC-104):

```ts
const [sessionUser, sessionContext] = await runInRequestScope(() =>
  Promise.all([identity.getSessionUser(), identity.getSessionContext()]),
);
if (sessionUser === null || sessionContext === null) return null;   // falla cerrado (R13)
```

El ámbito envuelve **solo** ese `Promise.all`, ni una línea más. Con actor `null`,
`requirePermission` rechaza en la primera línea del caso de uso, antes de tocar ningún puerto. Las
cinco firmas públicas de las Server Actions no cambian (R32).

### 3.2. El dominio traduce actor → ámbito, y el puerto lo exige

Nace `lib/modules/recetas/domain/recipe-scope.ts`, dominio puro:

```ts
/** Empresa EN CUYO NOMBRE se consulta o se escribe. No autoriza: filtra. */
export type RecipeScope = { readonly companyId: string };
```

Los **cinco** métodos de `RecipeRepository` ganan `scope: RecipeScope` **al final** de la firma: el
diff queda mínimo y ninguna llamada existente cambia de orden de argumentos.

```ts
interface RecipeRepository {
  create(data: NewRecipe, actorId: string, now: Date, scope: RecipeScope): Promise<{ id: string } | 'duplicate'>;
  findAliveById(id: string, scope: RecipeScope): Promise<RecipeRow | null>;
  listAlive(offset: number, limit: number, query: ListQuery, scope: RecipeScope): Promise<{ rows: readonly RecipeRow[]; total: number }>;
  replaceAlive(id: string, data: NewRecipe, actorId: string, now: Date, scope: RecipeScope): Promise<'ok' | 'not_found' | 'duplicate'>;
  softDeleteAlive(id: string, actorId: string, now: Date, scope: RecipeScope): Promise<'ok' | 'not_found'>;
}
```

Los resultados discriminados **no crecen**: «de otra empresa» se devuelve como `null` / `'not_found'`,
o sea por el mismo camino que «no existe», que es justo lo que R16 y R17 piden. El dominio no necesita
distinguirlos porque **no debe** distinguirlos (§10).

**Que esté en la firma hace que una llamada que la omita no compile. Una implementación que la omita,
en cambio, SÍ compila** —TypeScript admite asignar una función de menor aridad donde se espera una de
mayor, y así es como `lib/composition/index.ts` ata las funciones sueltas del adaptador—. Está
verificado contra el `tsc` de este repo por el reviewer de QC-49 (su `design.md:240-263`). Por eso la
segunda mitad de R14 la cierra una **guardia estática por función**, no el compilador (§8.1).

El caso de uso solo hace de correa: exige el permiso primero, valida la entrada, y pasa
`{ companyId: actor.companyId }` al puerto y a las dos costuras. No construye ninguna condición.

## 4. El único punto de consulta

Nace `lib/modules/recetas/adapters/driven/persistence/company-scope.ts`:

```ts
/** LA definicion de «de la empresa» del modulo `recetas`. Se escribe UNA vez. */
function companyScope(scope: RecipeScope): { companyId: string } {
  return { companyId: scope.companyId };
}

export function recipeCompanyScope(s: RecipeScope): Prisma.RecipeWhereInput { return companyScope(s); }
export function companyScopeColumns(s: RecipeScope): { readonly companyId: string } { return companyScope(s); }
```

Las envolturas existen **solo para tipar**: delegan en la misma función, así que hay una definición y
no varias. `companyScopeColumns` hace falta porque en un `…WhereInput` la columna es
`UuidFilter | string` y **opcional**, y esparcirla dentro del `data` de un `create` no compila (mismo
argumento literal que QC-49 `company-scope.ts:72-87`). Reglas de uso, que la guardia y los tests hacen
cumplir:

- **Toda lectura** compone el ámbito con `AND` con lo demás, **nunca** fundido en el mismo objeto que
  la búsqueda: en `buildRecipeWhere` hay un `nameNormalized: { contains }` y un `AND` de filtros; el
  ámbito entra **al mismo nivel que `deletedAt: null`**, que es justo donde el código ya demuestra que
  no se olvida. Un `OR` de búsqueda y el `companyId` al mismo nivel dejarían que un término de
  búsqueda **ampliara** lo visible (R15).
- **El `count` del listado usa literalmente el mismo objeto `where`** que el `findMany`, como ya hace
  hoy: el total no puede describir un conjunto distinto del que se devuelve.
- **Toda escritura que apunte a una fila existente** (`updateMany` de `replaceAlive` y de
  `softDeleteAlive`) lleva el ámbito **en el `where`**, no en un `if` posterior sobre la fila leída.
- **El alta escribe `companyId` desde `companyScopeColumns`** (R18). La empresa **no** viaja en
  `NewRecipe` ni en `createRecipeSchema`: lo que no está en el tipo no se puede escribir por
  accidente.
- **Las líneas no llevan ámbito propio, y eso no es una excepción** (R2, R20). En `replaceAlive` los
  tres pasos ya corren dentro de **una** `prisma.$transaction` y el paso 1 es el `updateMany`
  **acotado**: si devuelve `count === 0` se sale con `'not_found'` **antes** de tocar ninguna línea.
  El `deleteMany` y los `upsert` se filtran por `recipeId`, que en ese punto ya está probado de la
  empresa del actor. La guardia de §8.1 conoce esta regla y la comprueba por estructura —`recipeId`
  derivado del `id` verificado, dentro de la misma transacción—, no la exime.

**Sin lista de excepciones.** Esta ficha no crea ninguna y además **borra la única que había en el
repo** (§6.1).

## 5. `recipe_lines`, sin tocar el esquema

Las cinco líneas actuales y las futuras quedan aisladas por construcción:

| Vía | Qué la acota |
| --- | --- |
| Lectura de ficha y de lista | `include: { lines: true }` sobre una receta ya acotada (R15, R16) |
| Escritura en el alta | `create` anidado bajo la receta que se está creando con la empresa del actor (R18) |
| Escritura en la edición | los tres pasos de `replaceAlive`, tras el `updateMany` acotado (R20) |
| Borrado | `ON DELETE CASCADE` desde `recipes` |

No hay ninguna consulta que lea `prisma.recipeLine` por su cuenta, y la guardia de §8.1 comprueba que
no nazca ninguna sin pasar por la receta.

## 6. Las tres costuras hacia fuera del módulo, declaradas

Esta feature **toca código de otros tres módulos**, y lo hace a conciencia. Es legal y es el precedente
exacto de QC-60, que tocó `asignaciones` para cerrar su propio enlace: lo que se cruza es un **contrato
público** ya existente, no una tabla ni un repositorio ajeno. Ningún módulo gana un import nuevo hacia
otro.

### 6.1. `ProductCatalog.findRefs` (módulo `inventario`)

```ts
findRefs(ids: readonly ProductId[], companyId: string): Promise<readonly ProductRef[]>;
```

- La implementación (`product-catalog-prisma.ts`) compone **`productCompanyScope`**, el punto único que
  QC-49 dejó exportado en `inventario/.../company-scope.ts`, y **no** escribe un segundo
  `companyId: …` a mano. Es literalmente lo que su propio comentario manda (`:29-31`).
- **`companyId: string` suelto y no `RecipeScope` ni `InventoryScope`**: los tipos de ámbito son
  internos de cada módulo y exportarlos por el barrel para que el otro los construya sería acoplarlos
  por un dato que ya es una cadena en los dos lados. Misma asimetría que eligió QC-60 §6.
- **Muere la excepción.** Se vacía `SIN_AMBITO_POR_DECISION_APROBADA` en
  `guard-ambito-empresa-inventario.test.ts:74` y se borran los párrafos que la anunciaban en
  `product-catalog-prisma.ts:15-31` y en `inventario/.../company-scope.ts:28-33`. La guardia ya tiene
  escrito el caso que se pone rojo si la excepción sigue listada cuando la función **ya** declara
  ámbito (`:336-344`): sin este borrado, el gate da rojo.
- **Consecuencia aceptada y medida**: una receta de A que guarde el identificador de un producto de B
  deja de resolverlo y su ficha muestra ese producto como ausente —que es lo que ya hace hoy con un
  producto borrado (`get-recipe.ts:33-37`)—. Con el dato de hoy no afecta a ninguna fila: los cinco
  productos usados son de QuimiCloud.

### 6.2. `UnitCatalog.findRefs` (módulo `unidades`)

```ts
findRefs(ids: readonly UnitId[], companyId: string): Promise<readonly UnitRef[]>;
```

- La implementación (`unit-catalog-prisma.ts`) compone **`companyScopeWhere`**, la función que
  `unit-prisma.ts:151-153` ya exporta y que es **la única definición** de «de la empresa **o de
  sistema**»: `{ OR: [{ companyId }, { companyId: null }] }`. **No se escribe un segundo `OR`**, que
  es justo lo que su comentario (`:140-149`) pide y lo que exige R24.
- Esa es la semántica de **QC-76** y de la decisión 4: las unidades de sistema valen para todas las
  empresas. Con el dato de hoy, las cinco líneas usan unidades de sistema y **ninguna** deja de
  resolverse.
- El `OR` del ámbito se compone con `AND` contra `id: { in: ids }`, nunca al mismo nivel: al mismo
  nivel, el `in` y el `OR` se combinarían de forma que una unidad ajena podría colarse.

### 6.3. `RecipeCatalog.findRefsIncludingDeleted` (lo publica `recetas`, lo consume `pedidos`)

```ts
findRefsIncludingDeleted(ids: readonly RecipeId[], companyId: string): Promise<readonly RecipeRef[]>;
```

Es el cierre del hueco que QC-60 declaró (decisión 6, su R32 y su *Pregunta abierta 1*), y el
precedente exacto de **cómo** se hace es `OrderCatalog.findAliveById`, que QC-60 acotó igual:

- Sus **cuatro** llamantes son casos de uso de `pedidos` cuyo `Actor` **ya declara `companyId`** desde
  QC-60: `create-order.ts:89`, `update-order.ts:71`, `get-order.ts:84` y `list-orders.ts:149`. Pasan
  `actor.companyId` y **nada más cambia** en ese módulo: ni firmas públicas, ni errores, ni consultas.
- En el **alta** y la **edición** de pedido, una receta de otra empresa deja de volver en la respuesta
  y el caso de uso la rechaza con el error de receta inexistente que **ya** tiene (R26). No nace ningún
  código de error nuevo (§10).
- En **ver** y **listar**, la referencia simplemente no vuelve y el pedido se pinta como ya se pinta
  cuando la receta no se resuelve. La baja lógica sigue viajando en `isDeleted` y **no** se confunde
  con la ausencia (R25): el `where` gana la empresa y **no** gana ningún filtro de vida.
- La consulta se acota con `recipeCompanyScope` (§4), no con un `companyId` escrito a mano: es una
  consulta del módulo `recetas` y se rige por su punto único.

**Lo que esta ficha NO hace en `pedidos`**: no toca su ámbito por empresa —ya lo tiene—, no cambia
ninguna de sus Server Actions, no toca su correlativo y no añade ni quita ninguna de sus restricciones.

## 7. La migración

Una migración nueva, `db/migrations/<ts>_recipes_company_scope/`, con `migration.sql` y `down.sql`
(R6). **Escrita entera a mano**, no generada por `prisma migrate dev`: `recipes` y `recipe_lines`
cargan con FK escritas a mano, un `CHECK`, un índice único parcial, índices GIN de trigramas y RLS
forzada, todo lo cual `migrate dev` lee como drift y propone resetear una base con datos. Mismo motivo
y mismas palabras que QC-76, QC-80, QC-49, QC-81 y QC-60. Se aplica con `pnpm run db:migrate`
(`prisma migrate deploy`), que no mira drift.

### 7.1. UP, en orden

| # | Paso | Por qué ahí |
|---|---|---|
| 0 | `NO FORCE ROW LEVEL SECURITY` en `recipes` y `companies` | **La mina de QC-49**: las dos están `ENABLE`+`FORCE` **sin ninguna policy**, y bajo `FORCE` eso deniega también al dueño —con quien conecta Prisma—, incluido el `SELECT`. Esta migración lee `companies` y escribe `recipes`. Se cierra en el paso 6 |
| 1 | `ADD COLUMN "company_id" UUID` **anulable** | No hay `DEFAULT` que poner que no sea mentira |
| 2 | **Backfill** (R3) | La empresa se resuelve por `name_normalized = 'quimicloud'`, **nunca por identificador**: los uuid los genera `gen_random_uuid()` y difieren en cada base. Único fallback: que `companies` tenga exactamente **una** fila. Cualquier otro caso —cero, o varias sin la de nombre— `RAISE EXCEPTION` y la migración entera se deshace. **Todas** las filas, incluidas las de `deleted_at`. `ROW_COUNT` se compara contra el total de la propia tabla y aborta si no coincide. **Ningún `INSERT`, ningún `DELETE`** (R4) |
| 3 | `SET NOT NULL` | Llegar aquí significa que no queda ninguna fila sin valor |
| 4 | FK a `companies` (§2.1) | Después del relleno, por lo mismo |
| 5 | Guardia + relevo del índice único (§2.2) | Antes del `CREATE UNIQUE`, un `RAISE EXCEPTION` si dos recetas **vivas** de la misma empresa comparten nombre normalizado —imposible hoy, porque el único global aún vive, pero se escribe igual: el mensaje explica qué pasa, en vez de un `23505` suelto (calcado de QC-81 §2.1 y QC-60 §7.1)—. Después: `DROP INDEX recipes_name_unique` y `CREATE UNIQUE INDEX recipes_company_name_unique … WHERE deleted_at IS NULL` |
| 6 | `ENABLE` + `FORCE ROW LEVEL SECURITY` en las dos | Cierra el paréntesis del paso 0. Explícito e idempotente (R5). `recipe_lines` **no se toca en ningún paso** y conserva el suyo |

Todo ocurre dentro de la **única transacción** en la que Prisma ejecuta el archivo: cualquier
`RAISE EXCEPTION` deshace el archivo entero y la migración queda sin aplicar y **sin marcar** en
`_prisma_migrations`.

### 7.2. Sobre la base vacía

**Ninguna sentencia de este archivo puede abortar por tabla vacía**, y eso no es un efecto colateral:
`tests/helpers/test-database.ts` tolera **una sola** migración fallida al construir la plantilla, la de
QC-49, y si ésta también fallara la construcción se caería entera. Con cero recetas: el backfill
actualiza cero filas y `0 = 0` cumple la comprobación de `ROW_COUNT`; el `SET NOT NULL` pasa; los
índices se crean vacíos. **Pero el paso 2 sí aborta si no puede resolver la empresa**, exactamente como
QC-49 y QC-60 — y por eso la plantilla siembra la empresa inicial antes de migrar lo que queda. La
migración de esta ficha es **posterior** a la de QC-49, así que se aplica con «QuimiCloud» ya sembrada.

### 7.3. DOWN — y por qué **tiene que abortar entero**

Revierte en orden inverso y deja el esquema exacto anterior, **con el índice único global y parcial
restaurado** (R6). Lo primero del archivo, tras abrir el mismo paréntesis de RLS del UP —su guardia
**lee** `recipes` y `companies`, que bajo `FORCE` sin policy también están denegadas; es la lección que
QC-49 tuvo que corregir en revisión—, es la **guardia de datos** (R7):

1. **Identificar la empresa que escribió el UP**, con el mismo criterio del backfill; si es ambigua,
   abortar.
2. **Alguna receta cuya empresa no sea ésa** → abortar: quitar la columna convertiría las recetas de
   varias empresas en un único montón indistinguible.
3. **Dos recetas vivas de empresas distintas con el mismo nombre normalizado** → abortar. Recrear el
   índice único **global** es imposible si dos empresas tienen cada una su «Desengrasante industrial»,
   y con 48 empresas eso deja de ser hipotético en cuanto la segunda dé de alta una receta. La
   alternativa —renombrar, o borrar la fila que estorba— **descartaría dato de un cliente en
   silencio**, que es peor que no poder revertir. Precedente literal: **QC-49 R7**
   (`20260911130000_inventory_company_scope/down.sql:120-131`).

Los tres mensajes dicen **cuántas filas** y **qué hacer**, no solo que falló. Después: `DROP INDEX
recipes_company_name_unique` → `CREATE UNIQUE INDEX recipes_name_unique … WHERE deleted_at IS NULL` →
FK fuera → columna fuera → `ENABLE` + `FORCE`. **Ninguna fila se borra**: el archivo no tiene un solo
`DELETE`. `pnpm run db:rollback` lo aplica y deja `_prisma_migrations` coherente.

## 8. Verificación

### 8.1. La segunda mitad de R14: guardia estática por función

`tests/guards/guard-ambito-empresa-recetas.test.ts` (nueva), calcada de
`guard-ambito-empresa-inventario.test.ts` y `guard-ambito-empresa-pedidos.test.ts`: **método a método**
de `RecipeRepository` y de `RecipeCatalog` —y función a función de todo
`recetas/adapters/driven/persistence/`— comprueba que la implementación **declara**
`scope: RecipeScope` (o `companyId` en el caso del catálogo) y que ese valor **llega hasta** una
envoltura de `./company-scope`. **Sin lista de excepciones.** Comprueba además que ninguna consulta a
`prisma.recipeLine` se ejecuta fuera de la transacción que ya verificó la receta (§4).

### 8.2. Los tres niveles

1. **Integración contra Postgres**: rechazo cruzado real de las siete operaciones, cada una con su
   control positivo; el mismo nombre en dos empresas **se acepta**; dos veces en una **choca**; el
   nombre se libera al borrar; el backfill; la reversión abortada por cada una de sus dos causas; el
   `23505`/`P2002` auténtico con el índice compuesto y su `meta.target` (§0.7, R11).
2. **Unit con dobles**: los cinco casos de uso, el orden permiso → zod → puertos, y que «de otra
   empresa» sale como receta inexistente y **jamás** como `unauthorized`; producto y unidad ajenos →
   entrada inválida; la empresa de la entrada se descarta.
3. **Guardias**: la de §8.1, `guard-rls-force`, `guard-arquitectura-modulos`,
   `guard-dependencias-aprobadas`, `guard-aislamiento-integracion` y la del catálogo de errores.
4. **E2E** (R31, decisión 15), uno solo: `e2e/aislamiento-recetas.spec.ts`, con el patrón de
   `aislamiento-inventario.spec.ts` y `aislamiento-pedidos.spec.ts`.

> **Enmienda — 2026-09-16, decisión humana.** El paso del **acceso cruzado** de ese E2E **ya no se
> ejerce sustituyendo el identificador por DOM** en el diálogo de borrado, como decían esta sección
> y T20: se ejerce **navegando a la URL del detalle** de una receta de otra empresa
> (`/produccion/formulas/<id ajeno>`).
>
> **Por qué el patrón de QC-49/QC-60 no era aplicable aquí.** En aquellas dos fichas el diálogo de
> borrado es un formulario con un **campo oculto** que lleva el id y viaja en el `FormData`
> (`delete-product-dialog.tsx:106`, `delete-order-dialog.tsx:128`), así que reescribir ese nodo por
> DOM cambia de verdad lo que recibe el servidor. En `recetas` no: `delete-recipe-dialog.tsx:58`
> hace `await deleteRecipeAction(recipe.id)` con el id tomado del **cierre de React**, y **no existe
> ningún nodo del DOM que reescribir**. Darle el campo oculto habría sido tocar un componente, que
> §14 prohíbe expresamente.
>
> **Por qué el recorrido nuevo no es un apaño.** Pegar un enlace que alguien te pasó es un gesto
> real, y **cierra además la escritura**: el formulario de edición de la receta ajena nunca llega a
> pintarse. La página resuelve la receta en el servidor con `getRecipeAction(id)`, y un id **ajeno**
> recorre exactamente el mismo camino que uno **inexistente** —`findAliveById` acotado devuelve
> `null` y nace el mismo `RecipeNotFoundError`—, de modo que el E2E puede afirmar que **los dos
> casos se ven idénticos**: eso es justamente lo que prueba que no hay **oráculo de existencia**.
> Los pasos 1, 2 y 4 del recorrido no cambian.

### 8.3. Las listas cerradas, una por una

Las cinco de §0.6, **cada una con su task explícita** (T14–T18 de `tasks.md`). No se dan por hechas
como efecto colateral de otra task: una lista cerrada que se actualiza «de paso» es exactamente cómo
QC-60 se dejó una hasta el gate completo.

Y una sexta, de QC-104: `ACCIONES` en
`tests/unit/identity/session-once-per-request-actions.test.ts:156`. Sus dos primeros casos leen el
**árbol**, así que en cuanto `recipe-actions.ts` resuelva las dos caras de la sesión, el archivo
aparece y el caso «TODO archivo de driving/ con las dos caras está en la lista» se pone **rojo** hasta
que se le añada su fila. Es una task, no una sorpresa (T19).

## 9. Errores: nada nuevo en el catálogo

| Caso | Código | Por qué |
| --- | --- | --- |
| Ficha / edición / borrado de una receta de otra empresa | el «la receta no existe» de QC-70 (`RecipeNotFoundError`) | Ya existe y su mensaje es exactamente el que hay que dar |
| Producto o unidad de otra empresa en una línea | `invalid_input` (`ValidationError`) | Es entrada que no cuadra, no un permiso que falta. Es el mismo camino por el que hoy se rechaza un producto inexistente |
| Nombre repetido dentro de la empresa | `RecipeDuplicateNameError` | Ya existe; lo único que cambia es el alcance de la unicidad |
| Pedido con receta de otra empresa | el «receta inexistente» que `pedidos` ya da | El catálogo devuelve la referencia vacía, que es su contrato de hoy |

**Nunca `unauthorized`.** Distinguir «no puedes» de «no existe» sobre datos ajenos es un oráculo de
existencia: quien sondea identificadores aprendería qué recetas tienen las demás empresas. Es el mismo
criterio con el que la zona privada responde 404 y no 403
(`docs/architecture.md > Permisos y autenticacion`). **No se añade ninguna fila a `ERROR_CODES`** y la
guardia del catálogo sigue verde.

## 10. Alternativas descartadas

**A) Dar `company_id` propia a `recipe_lines`, copiando QC-49 D2.** Permitiría acotar la línea sin pasar
por la receta y expresar la coherencia con una FK compuesta `(recipe_id, company_id)`, que es lo que
hizo QC-60 con `order_assignments`. **Descartada por la decisión cerrada 2**, y además: QC-49 le dio
columna al lote porque **QC-81 necesitaba la unicidad `(empresa, lote)`**; aquí no hay ninguna
necesidad equivalente, y una segunda columna de empresa es un segundo dato que puede contradecir al
primero. La línea no se consulta fuera de su receta y cae con ella.

**B) Dos disparadores de coherencia en plpgsql, como QC-49 §2.4.** «El producto de la línea es de la
empresa de su receta» y «la unidad es de esa empresa o de sistema», con `RAISE EXCEPTION` y
`ERRCODE = '23514'`. Es defensa en profundidad de verdad y tiene precedente en el repo. **Descartada**
por tres motivos: la decisión cerrada 3 fija la frontera **en el service** y un disparador no la
sustituye; sin `company_id` en la línea (decisión 2) cada disparador tendría que hacer un `JOIN` a
`recipes` en cada escritura, incluido el `upsert` por línea de cada edición; y para leer `units`
tendría que cruzar a otro módulo desde SQL —legal, pero un coste de mantenimiento que aquí no compra
nada que el service no dé ya—. **Si el humano la quisiera, cabe en una ficha futura sin deshacer nada
de ésta.**

**C) Dejar el índice único de nombre global y solo filtrar en el service.** Cero migración de índices.
**Descartada porque no cumple la decisión 7**: dos empresas no podrían tener cada una su
«Desengrasante industrial», y el rechazo por nombre duplicado sería además un **oráculo de existencia**
sobre el catálogo ajeno —le diría a A que B ya usa ese nombre—.

**D) Crear el índice compuesto SIN el `WHERE deleted_at IS NULL`,** copiando literalmente el de
presentaciones de QC-49. **Descartada**: el de presentaciones era total porque `presentations` no tiene
borrado lógico. Aquí quitaría la liberación del nombre al dar de baja (R10) **en silencio**, que es
justo contra lo que avisa el comentario de la migración de QC-24.

**E) Implementar el aislamiento con policies de RLS y `set_config('app.company_id', …)` por petición.**
La respuesta canónica en Supabase. **Descartada entera**: Prisma conecta con el dueño de las tablas, no
setea claims, y el pooler en modo transacción no garantiza que el `set_config` y la consulta caigan en
la misma sesión física. Además la decisión cerrada 10 y `docs/architecture.md > Acceso a datos y
autorizacion` ya lo tienen cerrado: **un aislamiento que solo existe como policy no cuenta como
implementado**. La RLS se queda como defensa en profundidad (R5, R30).

**F) Repetir el filtro en cada una de las siete consultas.** Es lo que sale solo si nadie decide nada.
**Descartada por la decisión cerrada 11**: la consulta número ocho —la que escriba otra ficha dentro de
tres semanas— se olvida, y le enseña a una empresa lo que no es suyo.

**G) Una extensión del cliente Prisma (`$extends`) que inyecte el `where` globalmente.** Cero cambios en
el adaptador. **Descartada** con los dos argumentos que QC-49 y QC-60 dejaron en pie: es **implícita**
—la consulta filtra por algo que no está escrito en el archivo que la escribe— y es **global**, así
que alcanzaría a módulos que esta ficha no toca.

**H) Dejar `ProductCatalog.findRefs` y `UnitCatalog.findRefs` sin ámbito y validar la empresa del
producto con una consulta aparte dentro de `recetas`.** Evitaría tocar dos módulos. **Descartada**: sería
una **segunda** lectura de `products` desde `recetas` —justo lo que el contrato de catálogo existe para
impedir— y dejaría vivas dos excepciones de ámbito que sus propios autores escribieron «hasta QC-50».
Cerrarlas es el encargo, no un daño colateral.

**I) Pasar las fotos a enlaces privados y meter la empresa en la ruta.** Es lo que haría un aislamiento
«completo». **Descartada por la decisión cerrada 5**, que es del humano y es explícita: son material de
referencia, la empresa en la ruta no aislaría nada por sí sola, y el cambio a enlaces firmados es otra
ficha y otro coste. R27 lo fija para que nadie lo «arregle» de paso.

**J) Aplazar el cierre del hueco pedido → receta a una ficha propia.** **Descartada por la decisión
cerrada 6**: QC-60 lo dejó escrito «hasta QC-50» y sin fecha, y el cambio cuesta un parámetro en cuatro
llamadas cuyos actores **ya** llevan la empresa.

## 11. Dependencias de terceros

**Ninguna nueva** (R33). Esto es esquema, migración, un índice único, una definición de ámbito y un
campo más en un tipo: no hay nada que una librería mantenida resuelva mejor, y todo lo que hace falta
—`@prisma/client`, `pg` para los tests, zod, Playwright— está en el repo. Regla 7 de `CLAUDE.md` **sin
propuesta que abrir**: no hay cuatro checks de salud que reportar ni fila que añadir a
`docs/dependencias.md`; `package.json` y `pnpm-lock.yaml` quedan sin tocar y
`guard-dependencias-aprobadas` sigue verde sin cambios. **Si alguna task acabara pidiendo una, se para
y se propone: no se instala** (`docs/architecture.md > Dependencias de terceros`).

## 12. Riesgos y costes aceptados

1. **Drift de Prisma, ampliado.** La FK a `companies` y el índice único parcial viven escritos a mano
   en el SQL. Toda migración futura de `recipes` hay que revisarla a mano y borrarle los `DROP` que
   genere. El `///` del modelo ya lo avisa y esta ficha lo amplía.
2. **El único de nombre es parcial y no sirve para la verificación del `RESTRICT`** sobre recetas
   borradas (§2.2). Con 5 filas es un `seq scan` que gana; el día que el volumen lo pida, un índice
   propio por `company_id` es una línea.
3. **Los índices de listado no se recomponen** con `company_id` de cabeza (`recipes_name_idx`,
   `recipes_created_at_idx`, `recipes_name_normalized_trgm_idx`…). Decisión de volumen, no de
   corrección; mismo criterio que QC-49 §2.2 y QC-60 §2.2.
4. **El backfill depende de que exista «QuimiCloud»**. Sobre una base sin ella y con varias empresas,
   aborta entera y con mensaje: es lo que R3 pide, pero conviene saberlo antes de aplicarla en un
   entorno nuevo.
5. **Las fotos siguen siendo públicas** (decisión 5, R27). Quien tenga la URL de una imagen de otra
   empresa la sigue viendo. Declarado, no cerrado, y **sin ficha destinataria**.
6. **Una receta antigua que apuntara a un producto de otra empresa dejaría de resolver su nombre**
   (§6.1). Medido: hoy no hay ninguna.
7. **El residuo de empresas de tests sigue creciendo** (48 el 2026-09-15). No afecta al backfill —solo
   QuimiCloud tiene recetas—, pero QC-77 sigue sin limpiarlo.

## 13. Comentarios en el código de producción

Nada de citar `QC-<n>`, `R<n>` ni `design.md` en el código que esta ficha escriba o modifique: el
porqué se explica con sus propias palabras, y la trazabilidad vive en el spec y en los **nombres de los
tests**. Es la regla que se aplicó en QC-60; todavía no está en `docs/` —la trae QC-115—, así que se
escribe aquí para que el implementer no tenga que adivinarla. **Los comentarios que ya existen en
archivos que esta ficha toca no se reescriben en masa**: solo se corrigen los que esta feature deja
mintiendo (los tres de §6.1 sobre la excepción muerta).

## 14. UI

No hay pantalla nueva ni cambio visual: la pantalla bajo `FORMULAS_ROUTE` ve menos filas, nada más. No
se toca ningún componente (R32). No aplica la regla multiplataforma más allá de lo que la pantalla ya
cumple.

## Enmienda 2026-10-01 — versiones de receta (QC-172)

El índice `recipes_company_name_unique (company_id, name_normalized)` pasa a ser parcial con
`WHERE deleted_at IS NULL AND parent_recipe_id IS NULL`: solo cubre recetas originales. Se añade
`recipes_version_name_unique (parent_recipe_id, name_normalized)` con
`WHERE deleted_at IS NULL AND parent_recipe_id IS NOT NULL` para la unicidad entre versiones de la
misma original. Detalle en [`specs/QC-172-versiones-de-receta/`](../QC-172-versiones-de-receta/).
