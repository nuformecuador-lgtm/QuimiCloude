# Review QC-25 — crud-de-recetas

Reviewer, paso F2.2 de `AGENTS.md`. Worktree `.worktrees/QC-25-crud-de-recetas`, rama
`feature/QC-25-crud-de-recetas`, arbol limpio (todo commiteado).

**Veredicto: RECHAZADO** — 2 hallazgos MAYORES, 7 menores.

Aviso de honestidad sobre el metodo: no pude ejecutar mutaciones (editar produccion,
correr, revertir) porque el entorno bloquea la escritura de archivos de codigo desde este
rol. La comprobacion de "que los tests muerdan" se hizo leyendo cada asercion y barriendo
con grep quien referencia cada funcion de produccion. Donde el resultado es concluyente lo
digo; donde es inferencia, tambien.

---

## Checklist

### Especificacion
- [x] `requirements.md` con EARS numerados R1-R50, R15 tachado y derogado con motivo.
- [x] `design.md` existe y trae `## 12. Alternativas descartadas`.
- [ ] **`design.md` NO refleja R50** — ver MAYOR-2.
- [x] `tasks.md` con las 19 tasks (+T0) marcadas `[x]`: el barrido de casillas sin marcar
      no devuelve ninguna.

### Trazabilidad
- [x] `tasks.md > Trazabilidad` mapea los 50 requisitos vigentes; R15 figura tachado y
      NO se cuela como cubierto (fila `R15 | ~~derogado, ver R50~~`).
- [x] `progress/impl_QC-25-crud-de-recetas.md` contiene el mapa `R<n> -> test` por tanda.
- [ ] **R17 mapea a un test que no verifica lo que su nombre dice** — ver MAYOR-1.

### Calidad de codigo (corrido por mi, no leido de la bitacora)
- [x] `pnpm exec vitest run tests/unit/recetas tests/unit/unidades tests/unit/inventario`
      -> **33 archivos, 331 tests, todos verdes**.
- [x] `pnpm exec vitest run tests/guards tests/integration/recetas`
      -> **14 archivos, 149 tests, todos verdes** (integracion contra la base propia
      `QuimiCloude_QC25`, incluidos los 38 de `recetas`).
- [x] `./init.sh` completo: lo corrio el orquestador (108 archivos / 1117 tests, baseline
      vacio) y no lo repito por instruccion explicita.
- [x] E2E: diferido con motivo (D23, R44) porque la ficha no aporta pantalla. Correcto.
- [n/a] Multiplataforma: la feature no toca UI (`scope.test.ts` lo verifica barriendo
      `app/`, `components/` y `e2e/`).
- [x] Dependencias: ver seccion propia mas abajo.

### Datos y seguridad
- [x] **Permiso validado en el SERVICE, no en RLS.** `requireAdmin(actor)` es la primera
      linea de los cinco casos de uso (`create/get/list/update/delete-recipe.ts`), antes
      de zod y de tocar cualquier puerto. `domain/actor.ts` compara por igualdad exacta,
      sin `includes` ni normalizacion, y falla cerrado con actor ausente.
- [x] **El test muerde de verdad.** `tests/unit/recetas/authorization.test.ts` monta
      dobles de los CUATRO puertos (repositorio, `ProductCatalog`, `UnitCatalog`,
      `RecipeImageStorage`) que **lanzan si se les llama**, recorre los cinco casos de uso
      en tabla con Operador / rol nulo / rol vacio / rol desconocido / actor ausente, y
      afirma `not.toHaveBeenCalled()` sobre los diez metodos. Incluye consultar (`get`,
      `list`): el Operador no lee. Es el patron correcto.
- [x] RLS: la feature no crea tablas. `recipes`/`recipe_lines` las trajo QC-24 con
      `ENABLE` + `FORCE`, y `tests/guards/guard-rls-force.test.ts` sigue verde
      descubriendo las tablas del propio SQL.
- [x] **Ninguna migracion nueva**: el diff contra `dev` sobre `db/` esta vacio. El modelo
      es de QC-24 y el catalogo de unidades de QC-32, tal como manda R41.
- [x] Acceso a datos solo por Prisma. `@supabase/supabase-js` NO esta instalado
      (`node_modules/@supabase` contiene solo `storage-js`), asi que el cliente de datos
      que `CHECKPOINTS.md` prohibe no existe en el repo.
- [x] Sin secretos hardcodeados. Los tres nombres de variable viven una sola vez, como
      literales del arreglo `REQUIRED_ENV_VAR_NAMES`
      (`adapters/driven/config/storage-config-env.ts:21`), se leen DENTRO de una funcion y
      el error nombra las que faltan sin filtrar valores. `.env.example` (lineas 63, 66 y
      69) las declara **vacias** y documentadas; `.env*` sigue en `.gitignore`.

### Modulos hexagonales
- [x] `domain/` y `ports/` no importan framework, Prisma, `shared` ni adaptadores; solo
      `zod`, sus vecinos de `./domain` y los **tipos** `ProductCatalog`/`UnitCatalog` de
      los barrels ajenos.
- [x] De otro modulo solo el contrato: `create-recipe.ts` y `update-recipe.ts` importan
      `@/lib/modules/inventario` y `@/lib/modules/unidades`, nunca ruta profunda.
      `module-contract.test.ts` barre todo el modulo prohibiendo las rutas profundas.
- [x] Ningun driving instancia su driven: `recipe-actions.ts` pide todo a `@/lib/composition`.
- [x] `lib/shared/**` sigue siendo hoja del grafo (guardia de arquitectura, verde).
- [x] Ningun `'use server'` sale por el barrel: `index.ts` solo reexporta de `./domain`, y
      `guard-arquitectura-modulos.test.ts` vigila tambien el arrastre transitivo.
- [x] `@prisma/client` lo importa **un solo archivo** del modulo
      (`adapters/driven/persistence/recipe-prisma.ts`); `prisma.product` sigue prohibido en
      TODO `recetas` sin excepcion. `prisma.unit` lo consulta exactamente
      `lib/modules/unidades/adapters/driven/persistence/unit-catalog-prisma.ts`, verificado
      por el barrido de `tests/unit/unidades/module-contract.test.ts` con entrada sintetica.
- [x] La logica esta en `domain/`, no en la Server Action: `recipe-actions.ts` valida,
      resuelve actor, traduce errores y registra advertencias; nada mas.

### Configuracion
- [x] Direccion, bucket y credencial por variables de entorno, leidas en cada invocacion.

---

## Los cinco puntos que el encargo pedia morder

### 1. R50 — la unidad de la linea: **correcto en el codigo**
- Se valida contra el **contrato publico**: `create-recipe.ts` y `update-recipe.ts` llaman
  `deps.units.findRefs(...)`, tipado por `UnitCatalog` importado de
  `@/lib/modules/unidades` (el barrel). Ni tabla, ni modelo de Prisma, ni repositorio.
- El adaptador `unit-catalog-prisma.ts` vive **dentro de `unidades`** y calca a
  `product-catalog-prisma.ts` (misma forma `findRefs`/`toXRef`, mismo atajo con `ids`
  vacio, mismo `select` acotado). Correctamente **sin** filtro de vida: `Unit` no tiene
  `deletedAt`.
- Se cablea en `lib/composition/index.ts` con el mismo patron que `ProductCatalog`:
  `const unitCatalog: UnitCatalog = { findRefs: findUnitRefs }`, inyectado como `units:`
  solo en `createCreateRecipe`/`createUpdateRecipe`.
- La unidad sigue **obligatoria** (`unitIdSchema = z.string().uuid()`, sin `.optional()`
  ni `.nullish()`) y sigue **sin derivarse** del producto: `ProductRef.unitId` no se lee en
  ningun sitio de `recetas`; `get-recipe.ts` hace pass-through de `line.unitId`.
- Decision correcta y bien argumentada: en la edicion se valida el `unitId` de **todas**
  las lineas finales (no solo las nuevas), porque la excepcion de R45 nace del borrado
  logico del producto y `Unit` no lo tiene.
- Tests que muerden: `recipe-service.test.ts` (dos casos, alta y edicion, con `findRefs`
  devolviendo lista vacia, afirmando `toHaveBeenCalledWith([unitId exacto])` **y**
  `recipes.create`/`replaceAlive` `not.toHaveBeenCalled()`), mas `recipe-input.test.ts`
  para la forma UUID.

### 2. R45/R46 — existencia solo para productos nuevos: **correcto y bien probado**
- `update-recipe.ts`: diferencia de conjuntos real (`idsEnviados` menos `idsYaEnLaReceta`),
  y `findRefs` solo se llama si el resto no esta vacio.
- `recipe-lines-catalog.test.ts` no se conforma con el camino feliz: afirma
  `expect(products.findRefs).not.toHaveBeenCalled()` cuando solo se reenvia la linea vieja,
  `toHaveBeenCalledWith([PRODUCTO_NUEVO])` **exacto** con mezcla de vieja+nueva,
  `toHaveBeenCalledWith([PRODUCTO_NUEVO_DE_BAJA])` mas `replaceAlive` `not.toHaveBeenCalled()`
  al anadir uno de baja, y `toHaveBeenCalledWith([todos])` en el alta.
- Hay un agujero, pero esta un nivel mas abajo y es MAYOR-1: quien decide que "de baja"
  significa "no viene en `findRefs`" es el `deletedAt: null` del adaptador, y eso no lo
  prueba nadie.

### 3. R47-R49 — ciclo de vida de la imagen: **correcto**
- Los tres estados no se colapsan: `updateRecipeSchema` usa `.nullable().optional()`
  (nunca `.default()`), y `update-recipe.ts` ramifica en `undefined` / `null` / `{bytes}`
  de forma explicita, con `if (data.image === undefined)` primero.
- Un solo borrado: el puerto `RecipeImageStorage` solo expone `remove`; el adaptador solo
  implementa `removeRecipeImage`; los dos caminos escriben en la misma variable
  `pathToRemove` y pasan por la misma llamada. No hay `clearImage` ni equivalente.
- Un `remove` que falla no revierte: `removeImageSafely` captura, construye
  `{ operation, path, message }` y lo devuelve como `warnings`; el `catch` **no** esta
  vacio. La Server Action lo registra con `console.error` incluyendo operacion y ruta y
  aun asi responde `status: 'success'`.
- Orden verificado con un array de llamadas:
  `expect(llamadas).toEqual(['replaceAlive', 'remove'])` en `recipe-service.test.ts` — el
  borrado va DESPUES de que la base confirme.

### 4. Conciliacion de lineas: **correcta**
- `replaceAliveRecipe` corre los tres pasos en una sola `prisma.$transaction`:
  `updateMany` con `deletedAt: null` (0 filas -> `'not_found'`), `deleteMany` con
  `productId: { notIn: finales }` (**borrado fisico**, no `deleted_at`; `RecipeLine` ni
  siquiera tiene esa columna) y `upsert` por clave natural `recipeId_productId`.
- Verificado contra Postgres real: `recipe-crud.int.test.ts` cubre "la linea que desaparece
  se borra fisicamente" y "si falla una linea la edicion revierte entera".

### 5. Frontera de modulos: **correcta**
Ver el checklist de "Modulos hexagonales". No encontre ninguna ruta profunda, ningun
import de framework desde `domain/`/`ports/`, ningun `'use server'` reexportado.

---

## Hallazgos

### MAYOR-1 — El `deleted_at IS NULL` del catalogo de productos no lo prueba ningun test, y el test que dice probarlo no lo hace

**Archivo:** `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts:31`
**Test acusado:** `tests/unit/inventario/product-catalog.test.ts:26-32`
**Trazabilidad afectada:** R17 (y, por dependencia, R46 y la decision cerrada 26)

`findProductRefs` filtra con `where: { id: { in }, deletedAt: null }`. Ese `deletedAt: null`
es **el unico sitio del repo** donde vive la regla "el catalogo solo devuelve productos
vivos", y sobre ella descansa la mitad prohibitiva de R46: "anadir un producto dado de baja
se rechaza". Si se borra esa clausula, **la suite entera sigue verde**. Comprobado por
barrido: los unicos archivos de `tests/**` que nombran `findProductRefs` o
`product-catalog` son el propio test unitario y tres tests de forma de modulo que solo
citan la ruta como cadena de texto.

El test unitario tiene un `describe` llamado **"findRefs devuelve solo los productos vivos"**
cuyo unico `it` es "con una lista vacia de ids no consulta la base y devuelve una lista
vacia". No prueba nada sobre productos vivos. Y `tasks.md > Trazabilidad` cita literalmente
ese nombre como el test de R17, igual que `design.md:609`. Es el patron exacto que el
encargo pide cazar: un nombre que promete una garantia y un cuerpo que no la comprueba.

El propio implementer lo dejo escrito y luego no lo cumplio: el comentario de cabecera del
test dice "la garantia real de `deleted_at IS NULL` contra Postgres es del test de
integracion de esta feature (T14, `recipe-lines.int.test.ts`)". Fui a T14: el test de R18 en
`recipe-lines.int.test.ts:254-285` borra logicamente un producto y comprueba que la LINEA se
conserva (via `findAliveRecipeById`) — nunca llama a `findProductRefs`. La cobertura
prometida no llego.

**Que falta para cumplirlo:** un test de integracion contra Postgres real que cree dos
productos, borre logicamente uno, llame a `findProductRefs([vivo, borrado])` y afirme que
solo vuelve el vivo. Es el mismo archivo y el mismo `beforeAll` que ya existe. Con eso
R17/R46 quedan cerrados de verdad, y el `describe` unitario o gana ese caso o se renombra a
lo que realmente prueba.

### MAYOR-2 — `design.md` no refleja R50: la parte mas nueva de la feature se implemento sin diseno, y el diseno hoy contradice al codigo

**Archivo:** `specs/QC-25-crud-de-recetas/design.md`, lineas 54, 201, 239, 284, 609 y 632
**Regla:** `CLAUDE.md` regla 2 (requirements -> design -> tasks -> codigo, nunca directo a
codigo) y `docs/specs.md`

El diseno no menciona R50 ni una sola vez. Sigue describiendo el mundo anterior al merge de
QC-32:
- linea 54: "`recipeId`, `productId`, `quantity`, **`unit`**, marcas de tiempo".
- linea 201: `unit: string, trim, min 1  // R14, R15 (texto libre)` — cita como vigente un
  requisito **derogado**.
- linea 239: `RecipeLineView = { id, productId, productName, quantity, unit }`.
- No existe una sola mencion de `UnitCatalog`, de la dependencia `units:` de
  `CreateRecipeDeps`/`UpdateRecipeDeps`, del adaptador `unit-catalog-prisma.ts` dentro de
  `unidades`, ni de su cableado en `lib/composition`.
- linea 632 deja escrito que "cuando QC-32 migre la unidad a catalogo, actualizara ese
  test". QC-32 no lo hizo: lo hizo esta ficha, y el diseno no lo recogio.

R50 recorrio requirements -> tasks -> codigo saltandose el diseno. El resultado es correcto
(ver punto 1 de arriba), pero el artefacto que explica **por que** se hizo asi —por que la
edicion valida TODAS las unidades y solo los productos NUEVOS, por que el adaptador va en
`unidades` y no en `recetas`, que alternativa se descarto— solo existe hoy en la bitacora
del implementer, que no es un artefacto de spec. Y peor: quien lea `design.md` manana creera
que la unidad es texto libre.

**Que falta para cumplirlo:** actualizar `design.md` con la seccion de R50 (contrato
consumido, adaptador, cableado, la asimetria producto/unidad y su porque), corregir las
lineas 54, 201 y 239, y retirar la afirmacion de la 609 que promete la cobertura de
MAYOR-1. Corresponde a `spec_author` bajo el leader, no al implementer.

---

### menor-1 — Comentario obsoleto en el contrato de `unidades`
`lib/modules/unidades/domain/unit-catalog.ts`, bloque de doc de `interface UnitCatalog`:
sigue diciendo "Esta ficha NO lo implementa: no hay consumidor todavia (QC-38/QC-33)". Ya lo
hay: QC-25. Una linea.

### menor-2 — El snapshot completo de `Recipe`/`RecipeLine` es fragil por la misma razon que un censo global
`tests/unit/recetas/scope.test.ts:179-218` compara el cuerpo **entero** de los dos modelos
contra una lista literal de 15 y 12 lineas, con tipos y atributos Prisma incluidos. No es un
censo global del repo (no cuenta modelos ni migraciones), asi que no cae en la prohibicion
literal — pero **ya se rompio una vez** durante esta misma feature cuando llego QC-32, y
volvera a romperse con cualquier ficha vecina que toque legitimamente esos modelos. R41 solo
exige que esta feature no anada columna, indice ni restriccion: para eso basta afirmar el
conjunto de **nombres**, no la declaracion completa. Deuda conocida, acotada a dos modelos
que la ficha si reclama.

### menor-3 — La fila de `docs/dependencias.md` cita una version que no es la instalada
`docs/dependencias.md:32` dice "ultima release `2.114.0` del 2026-09-02"; `package.json`
fija `^2.115.0` y la bitacora confirma 2.115.0 instalada. Los cuatro checks se hicieron y la
aprobacion esta citada; solo el numero quedo desalineado.

### menor-4 — La edicion lee del repositorio antes de validar la entrada
`lib/modules/recetas/domain/update-recipe.ts:70-74`: `findAliveById(id)` corre **antes** del
`updateRecipeSchema.safeParse(input)`. No incumple R2 (`requireAdmin` sigue siendo la primera
linea) ni R38 en su letra (nada sin validar cruza hacia la logica), pero una entrada basura
provoca una consulta a la base evitable. `existing` solo se usa despues del parse.

### menor-5 — Cualquier `P2002` se traduce a "nombre duplicado"
`lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`, `isUniqueNameViolation`,
usado en `createRecipe` y `replaceAliveRecipe`: un `P2002`/`23505` del unico
`(recipe_id, product_id)` de `recipe_lines` se anunciaria al usuario como
`DuplicateNameError` ("ya existe una receta con ese nombre"). Hoy es inalcanzable porque zod
rechaza el producto repetido antes (R16) — por eso es menor y no mayor —, pero la traduccion
deberia mirar `meta.target` o el nombre del indice.

### menor-6 — Una asercion de R48 que no puede fallar
`tests/unit/recetas/recipe-image-lifecycle.test.ts:182`:
`expect(Object.keys(imagesReemplazo)).toEqual(Object.keys(imagesQuitar))` compara dos dobles
construidos por la **misma** factory `montarAlmacenamiento()`: es cierto por construccion, no
por el comportamiento del codigo. Las otras dos aserciones del mismo `it` (los dos caminos
llaman `remove` con la misma ruta) si muerden, y la garantia dura de "una sola
implementacion" la da el tipo del puerto. No resta cobertura; sobra ruido.

### menor-7 — Cierre pendiente del leader, no del implementer
`CHECKPOINTS.md > Verificacion final` pide entrada en `progress/history.md` y desmontaje del
worktree (o su HOLD anotado en `progress/current.md`). Ninguna de las dos esta hecha todavia
en esta rama. Es trabajo posterior a esta review; lo anoto para que no se pierda.

---

## Dependencias

- El diff contra `dev` sobre `package.json` anade **una sola** linea:
  `"@supabase/storage-js": "^2.115.0"`. Ninguna otra.
- Tiene su fila en `docs/dependencias.md:32` con los cuatro checks y la aprobacion humana
  citada; `design.md > 10` la recoge.
- **`@supabase/supabase-js` NO esta**: ni en `package.json`, ni en `node_modules/@supabase`
  (solo `storage-js`). La decision se cumplio.
- La consume **un solo archivo**, detras del puerto:
  `lib/modules/recetas/adapters/driven/storage/recipe-image-supabase.ts`. `scope.test.ts`
  vigila ademas que ningun test la importe (R43), y el adaptador lee su configuracion en
  cada invocacion —nunca al importar—, para que `lib/composition` pueda construir la
  fachada sin red ni bucket.
- No aparece ninguna utilidad escrita a mano que ya resuelva una libreria del stack: la
  paginacion se **reutiliza** de `lib/shared/pagination.ts` (inyectada, porque `domain/` no
  puede importar `shared`), la validacion es zod y la normalizacion del nombre es la unica
  definicion que publica el contrato.

## Censo global del repo

Barri los tests nuevos buscando afirmaciones sobre el estado global del repo del tipo "esta
feature anade exactamente N modelos", "hay N migraciones" o "tal carpeta esta vacia".
**No encontre ninguna.** Los dos casos que mas se acercan estan acotados y justificados:
`scope.test.ts` afirma sobre `Recipe`/`RecipeLine` (menor-2) y sobre la ausencia de pantalla
de recetas bajo `app/`, `components/` y `e2e/`, que es literalmente R44 y caera a proposito
cuando QC-26 construya la pantalla. Ademas, esta ficha **retiro** aserciones de censo
heredadas que ya no eran ciertas (`adapters/` vacia, `lib/composition` no menciona
`recetas`, `adapters/driven` de `unidades` vacia) en vez de dejarlas pudrirse, y con el
motivo escrito en el comentario de cada una. Bien hecho.

---

## Veredicto

**RECHAZADO.**

La feature esta, en lo sustancial, bien construida: la autorizacion se valida en el service
y su test es de los que muerden, los tres estados de la imagen no se colapsan, la
conciliacion borra de verdad dentro de una transaccion, R45/R46 resuelve el choque R17/R18
con aserciones de argumentos exactos, y la adaptacion a R50 —la parte que mas riesgo tenia—
pasa por el contrato publico de `unidades` con el mismo patron que `inventario`. La
verificacion que corri yo esta verde.

Vuelve por dos cosas:

1. **MAYOR-1 (implementer):** falta el test de integracion que demuestre que
   `findProductRefs` excluye los productos borrados logicamente, y hay que dejar de citar
   como cobertura de R17 un `describe` cuyo cuerpo no prueba lo que su nombre anuncia. Hoy
   se puede borrar el `deletedAt: null` de `product-catalog-prisma.ts` y la suite sigue
   verde: es exactamente lo que hundio la primera ronda de QC-30.
2. **MAYOR-2 (spec_author / leader):** `design.md` hay que ponerlo al dia con R50; ahora
   mismo describe la unidad como texto libre y cita R15 —derogado— como vigente.

Los siete menores no bloquean, pero menor-1, menor-3 y menor-7 son de una linea cada uno y
conviene cerrarlos en la misma vuelta.
