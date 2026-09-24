# QC-68 — busqueda-y-total-en-el-listado-de-pedidos · review (F2.2)

> Revisado el 2026-09-18 sobre el worktree
> `.worktrees/QC-68-busqueda-y-total-en-el-listado-de-pedidos`, rama
> `feature/QC-68-busqueda-y-total-en-el-listado-de-pedidos`, arbol limpio en `8f17650`.
> Diff revisado: `git diff origin/dev...HEAD` (32 archivos, +2341/-129).
>
> **Veredicto: OK.** 0 bloqueantes, 9 hallazgos menores. El unico rojo del gate completo es
> AJENO y esta verificado como tal (hallazgo 8).

---

## Checklist

### Especificacion
- [x] `requirements.md` con R1-R16 en EARS, numerados y cada uno citando su decision cerrada.
      `[D1]` y `[D7]` sin citar: correcto, herencia de QC-123, dicho por escrito.
- [x] `design.md` con **dos** alternativas descartadas y su porque (denormalizar
      `orders.recipe_name_normalized`, `> 4`; `include`/`join` de Prisma, `> 4.1`).
- [ ] `tasks.md` con **todas** las tasks `[x]` — **T21 sigue sin marcar** (hallazgo 7).
      T1-T20 marcadas y verificadas una a una contra el diff.

### Trazabilidad
- [x] Cada `R<n>` mapea a al menos un test concreto (mapa en el `impl_`, seccion «Mapa de
      trazabilidad R1-R16 (T21)»). Verificado caso por caso: **los tests citados existen, con
      el nombre exacto que dice el mapa**.
- [x] Los dos requisitos cerrados tarde estan de verdad probados:
  - **R6** — los dos casos nuevos existen y **no pasan por casualidad**. Verificado por
    mutacion: quitando el termino de `recipeIds` del `AND` de `buildOrderWhere`, **los dos
    caen** junto con otros seis (8 rojos de 21); quitando `{ deletedAt: null }`, cae el del
    pedido borrado. Matiz en el hallazgo 4 sobre el caso del pedido ajeno.
  - **R13** — `tests/unit/recetas/schema/recipes-search-index-migration.test.ts` es un test
    real y falsable: extrae el nombre del indice **del propio `CREATE INDEX`** en vez de
    copiarlo a mano, y lo compara con el `DROP INDEX` del `down.sql`. Lleva ademas tres
    comprobaciones de falsabilidad dentro (mutacion del `WHERE`, del nombre y del
    `DROP EXTENSION`). Sustituye bien a la «verificacion a mano» de la tanda 1.
- [x] `progress/impl_<feature>.md` contiene el mapa `R<n> -> test`.

### Verificacion ejecutable (corrida por mi, no leida de la bitacora)
- [x] `./init.sh` **completo**: `Test Files 1 failed | 530 passed (531)` ·
      `Tests 1 failed | 7799 passed | 92 skipped (7892)` · 643 s.
      typecheck verde, lint verde, base al dia (35 migraciones aplicadas), validaciones del
      arnes verdes (max-2-por-zona, specs presentes, fichas del board).
- [x] El **unico** rojo es `tests/unit/configuracion-ui/user-table.test.tsx` (QC-67).
      Comprobado: la rama **no toca ni un archivo** de ese modulo
      (`git diff --name-only origin/dev...HEAD` no devuelve nada de `configuracion*`,
      `user-table` ni `identity`) y **aislado pasa 27/27**. Rojo ajeno por carga de suite,
      familia QC-58. No es hallazgo de QC-68 (hallazgo 8, para el leader).
- [x] Mutaciones propias, todas revertidas y el arbol comprobado limpio despues de cada una.

### Calidad, seguridad y arquitectura
- [x] **Aislamiento por empresa.** El diff **no toca `db/schema.prisma`**: no hay modelo nuevo,
      asi que no aplica la columna de empresa. La consulta nueva (`findRecipeIdsMatchingName`)
      filtra por `recipeCompanyScope(scope)` con el `companyId` del actor, tiene test unitario
      del `where` y **test de rechazo cruzado** de integracion. El ambito sigue saliendo del
      **actor** y nunca de la entrada (`list-orders.ts:131` y `:146`).
- [x] **La firma reordenada es la acordada.** `listAlive(query, recipeIds, scope)` en puerto,
      adaptador y dominio; `scope` vuelve a ser el ultimo argumento, que es lo que exigen el
      encabezado de `order-repository.ts:29-31` y las dos guardias.
- [x] **El unico cambio en `tests/unit/pedidos/company-isolation-service.test.ts` es el
      autorizado**: la lista de parametros del doble de `listAlive` mas una linea de comentario
      (`+2/-1`). El aserto `args[args.length - 1]`, `visible()`, el `Set` de los seis metodos y
      los nombres de los casos quedan intactos.
- [x] **`tests/guards/guard-ambito-empresa-pedidos.test.ts` NO aparece en el diff.** Ninguna
      guardia se aflojo para acomodar la ficha.
- [x] Capas separadas: `pedidos/domain/` importa solo el **tipo** `RecipeCatalog` desde el
      barrel `@/lib/modules/recetas`, nunca una ruta profunda; el cableado vive en
      `lib/composition/index.ts`; `pedidos` no toca `prisma.recipe`.
- [x] Sin secretos, sin hardcode de contexto, sin webhooks nuevos, sin RLS que tocar.
- [x] **Migracion reversible**: `migration.sql` + `down.sql`, sin `DROP EXTENSION`. El indice
      no se declara en `db/schema.prisma`, igual que sus seis hermanos de QC-57.
- [x] **Censo de indices, conteo verificado EN DISCO y no contra el spec**: `PARTIAL_INDEXES`
      24 + `FULL_INDEXES` 9 + `TOTAL_POR_DECISION` 1 = **34**, y `SEARCH_INDEXES` = **7**. El
      33 -> 34 del implementer es correcto; el 34 -> 35 del `tasks.md` estaba caducado y lleva
      su correccion fechada. El caso pasa contra la base real.
- [x] **Dependencias**: `package.json` **no** esta en el diff. Ninguna dependencia nueva.
      Tampoco hay utilidad escrita a mano que duplique una libreria del stack:
      `normalizedSearchCondition` y `normalizeRecipeName` se **reutilizan**, no se reinventan.
- [x] **Multiplataforma**: no aplica. Los archivos de `app/` del diff cambian **solo
      comentarios**; `searchable={false}` del JSX no se toca y la pantalla sigue sin caja de
      busqueda (R16). Ni un `100vh`, ni un `:hover`, ni un target tactil, ni un `font-size`
      nuevos.
- [x] **E2E**: diferido a QC-122 con motivo escrito y ficha destino creada (`[D3]`,
      `design.md > 9`). No lo cuento como hallazgo.
- [x] **R15 — ningun test que hoy pasa quedo borrado ni aflojado.** Los once `it`/`describe`
      que desaparecen del diff estan **todos** sustituidos por su version tensada, y los dos de
      T15 («la pantalla no busca») **se conservan** con motivo nuevo y `R16` en el nombre. El
      unico aserto que cambia de forma —`Object.keys(d.recipes)` pasa a comprobar
      **llamadas**— es mas fuerte, no mas debil.

### Comentarios (`docs/conventions.md > Comentarios`)
- [x] **Ninguna linea de produccion anadida o modificada cita `QC-<n>`, `R<n>`, `design.md` ni
      «decision cerrada»**. Verificado con un barrido sobre las lineas `+` del diff de `app/`,
      `lib/`, `components/`, `hooks/`, `middleware.ts` y `db/`: cero coincidencias.
- [x] Los censos de comentario estan hechos, y los tres «al contrario que en pedidos» de otros
      modulos (`product-table.tsx:39`, `product-list-params.ts:36`,
      `presentation-table.tsx:33`) los revise uno a uno: hablan del **prop de la tabla y de la
      pantalla**, que no cambian, asi que **siguen siendo ciertos**. No son hallazgo.
- [ ] Dos razones escritas siguen diciendo algo que el codigo no hace: hallazgos 1 y 2.

---

## Hallazgos

### 1. `menor` — el docblock de `listAlive` sigue diciendo «Un solo parametro», y son tres
`lib/modules/pedidos/ports/order-repository.ts:63` mantiene «**Un solo parametro.**
`OrderFilters` desaparecio con QC-57...». La rama **anadio cuatro lineas a ese mismo docblock**
(`:80-84`) y dejo la cabecera en pie; desde `4f08a3e` la firma tiene tres parametros. Es
exactamente el defecto que esta ficha persigue —una razon escrita que deja de ser cierta— y esta
en el archivo que T6 tenia el encargo de poner al dia. Arreglo: una linea, sin citar ficha ni
requisito.

### 2. `menor` — «quien demuestra el numero de consultas SQL es el test de integracion»: ese test no existe
La frase esta en `tests/unit/pedidos/list-orders.test.ts:557`, en `design.md > 3` (nota fechada
2026-09-17), en `tasks.md > T9` y en el `impl_`. **Ningun test del repo cuenta consultas SQL**:
un barrido por `$on('query')`, `$extends` y variantes en `tests/integration/` y
`tests/unit/pedidos/` no devuelve nada. La nota resuelve bien la discrepancia de cifras —2/3
invocaciones de puerto frente a 3/4 consultas SQL— pero cierra con una promesa que nadie cumple.
R8 **si** esta cubierto (el numero de invocaciones no crece con las filas, y dentro de
`listAlive` el par `findMany`+`count` es constante por construccion); lo que sobra es la frase.
Arreglo: decir que el conteo de SQL **no esta probado** y que lo que se prueba es que no crece
con las filas, o escribir el test que promete.

### 3. `menor` — el caso «R2: ignora acentos y mayusculas» no tiene ni un acento
En `tests/integration/pedidos/list-query-orders.int.test.ts` la receta se siembra como
`Acido Citrico <marca>` y el termino es `'ACIDO citrico'`: **no hay ningun caracter acentuado en
ninguno de los dos**, asi que el caso solo ejercita mayusculas. Los acentos si estan cubiertos,
pero por partes y en otro sitio: `recipe-catalog.test.ts` > `ignora acentos y mayusculas al
normalizar el termino (R2)` (`'CLÓRO'` -> `contains: 'cloro'`, que ademas prueba que el
normalizador es el de recetas) y `tests/unit/recetas/domain/recipe-name.test.ts` > `quita los
acentos`. Como `recipes.name_normalized` la escribe **la misma** funcion, R2 se sostiene; lo que
falla es que el caso **promete mas de lo que hace**. Arreglo: sembrar `Ácido Cítrico` y buscar
`acido citrico`. Dos caracteres.

### 4. `menor` — el caso «R6: un pedido de OTRA empresa» prueba el ambito de RECETAS, no la conjuncion en `buildOrderWhere`
Verificado por mutacion: **quitando `orderCompanyScope(scope)` del `AND` de `buildOrderWhere`,
`list-query-orders.int.test.ts` sigue verde 21/21**, ese caso incluido. El cero que afirma viene
de que `findRecipeIdsMatchingName` ya filtro por empresa y devolvio `[]`, no de la conjuncion del
lado de pedidos. No es un falso positivo —el caso ejercita literalmente el enunciado de R6 y el
comportamiento es el correcto— y el ambito del lado de pedidos **si** esta protegido en otro
sitio: la misma mutacion pone **13 casos en rojo** en
`tests/integration/pedidos/company-scope-queries.int.test.ts`. Pero conviene saber que ese caso
no es el que vigila la conjuncion. Endurecerlo cuesta tres lineas: llamar a
`listAliveOrders(consulta({...}), [idDeLaRecetaAjena], scope())` con los ids **forzados a mano** y
esperar cero. El caso hermano, el del pedido borrado, **si** vigila su mitad: cae en rojo al
quitar `{ deletedAt: null }`.

### 5. `menor` — la segunda mitad del caso de R15 es tautologica
`R15: sin termino de busqueda, la lista vuelve exactamente igual que antes de esta feature`
compara `listAliveOrders(..., recipeIds, scope())` con `listAliveOrders(..., null, scope())`
**despues** de afirmar que `recipeIds` es `null`: son dos llamadas con argumentos identicos y la
comparacion no puede fallar nunca. La primera afirmacion (`''` -> `null`) si vale. La sustancia
de R15 esta cubierta de verdad por el resto del archivo y por `order-repository.int.test.ts`, que
siguen afirmando orden, filtros, paginacion y total con los mismos valores de antes —solo cambio
el argumento `null`—, y por el hecho comprobado de que ningun test se borro ni se aflojo.
Arreglo: afirmar valores concretos (orden por defecto y total del dia sembrado) en vez de
comparar una llamada consigo misma.

### 6. `menor` — de los cinco campos que R3 enumera, solo se ejercita el correlativo
R3 dice «ni el numero correlativo, ni el estado, ni la prioridad, ni la cantidad, ni el motivo de
cancelacion». El caso `R3` busca el correlativo y nada mas. Los otros cuatro son imposibles por
construccion —el termino nunca llega al `where` como texto—, asi que no lo trato como requisito
sin cubrir; pero anadir dos asertos al mismo caso (buscar `'PENDIENTE'` y buscar la cantidad)
cuesta dos lineas y cierra el enunciado entero.

### 7. `menor` — T21 sigue sin marcar `[x]`
`CHECKPOINTS.md > Especificacion` exige **todas** las tasks marcadas. La bitacora la deja sin
marcar a proposito porque su criterio de hecho es el gate, que corre el leader. Con el gate ya
corrido y el mapa R1-R16 completo, **T21 se puede marcar**. Menor porque la sustancia esta hecha:
es una anotacion, no trabajo.

### 8. `menor` (para el leader, no para el implementer) — `./init.sh` completo NO termina en verde
Sale con `hay rojos NUEVOS respecto del baseline` por
`tests/unit/configuracion-ui/user-table.test.tsx` (QC-67), **ajeno a esta rama** y verificado como
tal por mi (la rama no toca ese modulo; aislado pasa 27/27; el fallo es el
`findByTestId(USER_SHEET_TESTID)` que no aparece bajo carga de suite). No es hallazgo de QC-68 y
no bloquea esta review, pero el checkpoint «`./init.sh` termina en verde» no se cumple **en la
forma**, y el PR no deberia abrirse con el gate en rojo sin decirlo. El propio gate senala la
via: darlo de alta en `tests/baseline-rojos.json` con su motivo y su fecha, o arreglarlo en su
ficha. Decision del leader.

### 9. `menor` — un bloque de comentario de seis lineas en produccion
`order-repository.ts:80-84` mas su cierre. `docs/conventions.md > Comentarios` pide «~5 lineas».
Es marginal y el contenido es un porque legitimo (que significa `null` frente a `[]`); se anota
por completitud, no porque estorbe.

---

## Pruebas por mutacion que corri yo

Todas sobre `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts`, revertidas con
`git checkout --` y con `git status --short` vacio despues de cada una.

| Mutacion | Resultado |
| --- | --- |
| `recipeIds` deja de componerse en el `AND` | `tests/integration/pedidos/list-query-orders.int.test.ts`: **8 rojos de 21** — R1, R2, R3, R4, R5, R10 y **los dos de R6**. La busqueda entera es falsable. |
| `{ deletedAt: null }` fuera del `AND` | **2 rojos**, entre ellos `R6: el pedido BORRADO...`. Su mitad esta vigilada de verdad. |
| `orderCompanyScope(scope)` fuera del `AND` | `list-query-orders.int.test.ts` **verde 21/21** (hallazgo 4), y `company-scope-queries.int.test.ts` **13 rojos de 26**: el ambito de pedidos si esta cubierto, pero en otro archivo. |

Y una corrida aislada: `tests/unit/configuracion-ui/user-table.test.tsx` -> `27 passed (27)`.

---

## Lo que NO es hallazgo, dicho para que no se reabra

- **El total del pedido no esta**: salio a QC-123 el 2026-09-17 por decision del humano.
  `[D1]` y `[D7]` sin citar es correcto y esta explicado en el propio `requirements.md`.
- **No hay E2E**: diferido a QC-122 con motivo escrito y ficha destino creada.
- **El conteo 33 -> 34 de T17** contradice al `tasks.md` (34 -> 35) y **el implementer tiene
  razon**: lo comprobe en disco (24 + 9 + 1 = 34) y contra la base real.
- **La firma `(query, recipeIds, scope)`** y el ajuste de una linea en
  `company-isolation-service.test.ts` son decision del humano del 2026-09-18, con el alcance
  respetado al pie de la letra.
- **El rojo de `user-table.test.tsx`** es ajeno (hallazgo 8).

---

## Veredicto

**OK.** Ningun bloqueante. **9 hallazgos menores**, ninguno impide el merge. Los numeros **1** y
**2** son los que merecen arreglarse antes del PR: son razones escritas que hoy dicen algo falso,
que es justo el defecto que esta ficha nacio para perseguir, y cuestan una linea cada uno. El
**7** es una anotacion en `tasks.md`; el **8** es una decision del leader sobre el baseline de
rojos.
