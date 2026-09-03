# Review QC-25 — crud-de-recetas

Reviewer, paso F2.2 de `AGENTS.md`. Worktree `.worktrees/QC-25-crud-de-recetas`, rama
`feature/QC-25-crud-de-recetas`.

| Ronda | Fecha | Metodo | Veredicto |
| --- | --- | --- | --- |
| 1 | 2026-09-03 | Lectura + grep + correr suites. **Sin mutaciones** (el entorno bloqueaba escribir codigo desde este rol). | **RECHAZADO** — 2 MAYORES, 7 menores |
| 2 | 2026-09-03 | **12 mutaciones ejecutadas** sobre codigo de produccion y sobre `db/schema.prisma`, cada una revertida y verificada con `git diff` vacio. | **APROBADO** — 0 MAYORES, 4 menores (ninguno bloqueante) |

---

# RONDA 2 (vigente)

## Que se verifico, y como

La ronda 1 se cerro con una advertencia de honestidad: no se pudieron ejecutar mutaciones.
Esta ronda **si las ejecuta**. El metodo, para cada garantia cara: borrar o invertir la
linea de produccion que la sostiene, correr el test que dice cubrirla, exigir rojo, y
restaurar con `git checkout --` comprobando que `git diff` queda vacio. Un hallazgo mayor
no se cierra con el reporte de quien lo corrigio.

### Tabla de mutaciones

| # | Que borre o cambie | Archivo:linea | Test que se puso ROJO | Veredicto |
| --- | --- | --- | --- | --- |
| M1 | Quitar `, deletedAt: null` del `where` de `findProductRefs` | `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts:31` | `tests/integration/recetas/recipe-lines.int.test.ts > R17: findProductRefs solo devuelve productos vivos > devuelve la ref del producto vivo y omite la del producto borrado logicamente` — `AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]`, sobra el id del borrado | **ROJO. MAYOR-1 cerrado** |
| M2 | Anular el `if (missing) throw new ValidationError()` del producto nuevo no encontrado | `domain/update-recipe.ts:89` | `recipe-lines-catalog.test.ts > R46 … > rechaza la edicion cuando el producto de la linea nueva no viene en findRefs (inexistente o de baja)` | ROJO |
| M3 | `const idsANuevoValidar = idsEnviados` (validar TODAS las lineas, no solo las nuevas) | `domain/update-recipe.ts:83` | 3 rojos: `R45 … > reenviar la linea que ya tenia la receta, con su producto de baja, no la incluye en la consulta al catalogo`; `R45 … > con una linea vieja y una nueva, findRefs se llama SOLO con el id de la nueva`; y el de R46 | ROJO |
| M4 | Anular el `if (missingUnit) throw …` de la edicion | `domain/update-recipe.ts:101` | `recipe-service.test.ts > R50 — unidad inexistente > en la edicion valida el unitId de TODAS las lineas finales, no solo de las nuevas` | ROJO |
| M5 | Anular el `if (missingUnit) throw …` del alta | `domain/create-recipe.ts:64` | `recipe-service.test.ts > R50 — unidad inexistente > rechaza la linea cuyo unitId no existe en el catalogo de unidades, sin crear nada` | ROJO |
| M6 | Colapsar el estado "omitida" con el de "quitarla": `if (data.image === undefined)` pasa a `if (false)` | `domain/update-recipe.ts:108` | 6 rojos en 3 archivos, encabezados por `recipe-image-lifecycle.test.ts > R47 — image omitido conserva la imagen sin tocar el almacenamiento` y `recipe-service.test.ts > R21 — receta sin imagen` | ROJO |
| M7 | El camino `null` no encola el borrado del archivo anterior (`pathToRemove = null`) | `domain/update-recipe.ts:114` | 3 rojos: `R47 — image null persiste imagePath NULL y borra el archivo anterior`; `R48 — reemplazar y quitar la imagen llaman al mismo remove del puerto`; `R49 — si el remove falla la edicion no se revierte` | ROJO |
| M8 | `removeImageSafely` propaga el error en vez de devolver la advertencia (`throw error` en el `catch`) | `domain/update-recipe.ts:48` | 2 rojos: `R49 … > si el remove falla la edicion no se revierte y devuelve la advertencia con su contexto` y `… el mismo caso con el camino de reemplazo` | ROJO |
| M9 | Anular el `if (missing) throw …` del alta (producto inexistente) | `domain/create-recipe.ts:52` | `recipe-service.test.ts > R17 — producto inexistente > rechaza la linea cuyo producto no existe, consultando el contrato de inventario` | ROJO |
| S1 | Anadir la columna `notaExtra String?` a `model RecipeLine` | `db/schema.prisma` | `scope.test.ts > … > esta feature no anade ninguna columna, indice ni restriccion a recipes ni a recipe_lines` — mensaje `model RecipeLine gano, perdio o renombro un campo…` | ROJO |
| S2 | Anadir `@@index([name], map: "recipes_name_idx")` a `model Recipe` | `db/schema.prisma` | el mismo test, con el mensaje de `model Recipe` | ROJO |
| M10 | `isUniqueNameViolation` devuelve siempre `false` | `adapters/driven/persistence/recipe-prisma.ts:129` | **NINGUNO.** Los 39 tests de `tests/integration/recetas` siguieron **verdes** | **SOBREVIVIO** → menor-10 |

**11 de 12 mutaciones murieron.** La superviviente genero un hallazgo nuevo (menor-10), que
se documenta abajo y **no es bloqueante** por las razones que ahi se explican.

Tras cada mutacion: `git checkout --` y `git diff --stat` vacio. Al terminar, `git status
--short` limpio y `git diff` vacio: **el arbol quedo identico al original**.

## Verificacion ejecutable corrida por mi en esta ronda

- `pnpm exec vitest run tests/unit/recetas tests/unit/unidades tests/unit/inventario tests/guards tests/integration`
  → **55 archivos, 576 tests, todos verdes**, con el arbol ya restaurado.
- `./init.sh` completo: lo corrio el leader (108 archivos, **1118 tests**, cero rojos,
  baseline vacio). No lo repito por instruccion explicita.
- Prueba empirica adicional contra Postgres real (script temporal, borrado despues; `git
  status` limpio) para el comportamiento que M10 dejo sin cubrir: `createRecipe` con un
  nombre que normaliza igual devuelve `'duplicate'`, y `replaceAliveRecipe` apuntando al
  nombre de otra receta viva **tambien** devuelve `'duplicate'`. El codigo se comporta bien;
  lo que falta es el test, no la correccion.

## Estado de los hallazgos de la ronda 1

| Hallazgo | Responsable | Estado | Como lo verifique |
| --- | --- | --- | --- |
| **MAYOR-1** — el `deleted_at IS NULL` de `findProductRefs` no lo probaba nadie, y el `describe` que decia probarlo no lo hacia | implementer (`79d1c8a`) | **CERRADO** | **M1**: quite la clausula y el test de integracion nuevo se puso rojo con el diff exacto de ids. Ademas verifique que el `describe` unitario mentiroso se renombro a `findRefs con lista vacia` y que su cabecera ahora **manda al test de integracion** en vez de prometer una cobertura inexistente. La trazabilidad de R17 en `tasks.md:209` cita el test real. |
| **MAYOR-2** — `design.md` no reflejaba R50 y contradecia al codigo | spec_author (`e91bc5d`) | **CERRADO** | Lei `design.md` **contra el codigo**, no contra el reporte. Desglose abajo. |
| menor-1 — comentario obsoleto en `UnitCatalog` | implementer (`cbcd939`) | CERRADO | `unit-catalog.ts` ya cita a `recetas` (`create-recipe`/`update-recipe` via `deps.units.findRefs`, QC-25/R50). |
| menor-2 — snapshot completo de `Recipe`/`RecipeLine`, fragil | implementer (`cbcd939`) | CERRADO **sin perder mordida** | `scope.test.ts` compara ahora solo el **nombre** de cada campo, pero las lineas `@@…` completas. **S1 y S2** demuestran que sigue cerrando R41: anadir una columna o un indice lo pone rojo. No se quedo corto. |
| menor-3 — version desalineada en `docs/dependencias.md` | leader (`e91bc5d`) | CERRADO | La fila dice ahora "ultima release `2.114.0` … (**instalada `2.115.0`**, publicada despues de los checks; el rango de `package.json` es `^2.115.0`)". Coincide con `package.json`. |
| menor-4 — la edicion leia el repositorio antes de validar | implementer (`cbcd939`) | CERRADO | `update-recipe.ts:71-76`: `safeParse` primero, `findAliveById` despues. `requireAdmin` sigue siendo la linea 69, la primera. |
| menor-5 — cualquier `P2002` se traducia a "nombre duplicado" | implementer (`cbcd939`) | CERRADO, con cola (menor-10) | `isUniqueNameViolation` inspecciona `error.meta.target` y solo `name_normalized` cuenta. Verifique **empiricamente** que los dos caminos reales siguen devolviendo `'duplicate'`: el estrechamiento no rompio R8 ni R10. |
| menor-6 — asercion de R48 que no podia fallar | implementer (`cbcd939`) | CERRADO | La comparacion de las dos factorias identicas ya no esta; las dos aserciones que si muerden siguen, y **M7** las pone rojas. |
| menor-7 — cierre del leader (history + worktree) | leader | **PENDIENTE, y es correcto que lo este** | Es trabajo posterior a esta review. Se re-anota abajo. |

## MAYOR-2 verificado contra el codigo

Lei `design.md` sobre cada punto que la ronda 1 senalo, contrastandolo con los archivos:

- **Seccion nueva** `## 6b. La frontera con unidades: la unidad de la linea (R50, deroga
  R15)` (linea 206 y siguientes), con sub-secciones para el contrato consumido (6b.1), donde
  vive el adaptador y **por que en `unidades`** (6b.2), el cableado en `lib/composition`
  (6b.3) y la asimetria (6b.4). Contrastado con el codigo: el import de **tipo** desde el
  barrel (`create-recipe.ts:10`, `update-recipe.ts:10`), el adaptador `unit-catalog-prisma.ts`
  dentro de `unidades`, y `const unitCatalog: UnitCatalog = { findRefs: findUnitRefs }` en
  `lib/composition/index.ts`. **Coincide.**
- **La asimetria** (tabla de la linea 278 y su porque en 287-291): "`unitId`: se validan
  **todas** las lineas" frente a "`productId`: solo las nuevas". Es exactamente lo que hace
  el codigo — `update-recipe.ts:81-90` (diferencia de conjuntos para productos) frente a
  `:96-102` (`Set` sobre **todas** las lineas finales para unidades) — y el motivo escrito
  (`Unit` no tiene borrado logico, asi que no hay contradiccion R17/R18 que resolver) es el
  correcto. **Coincide.**
- **Las seis lineas de la ronda 1**: la 54 dice hoy `unitId` uuid con FK (lineas 63-64); la
  201 desaparecio y en su lugar `recipeLineSchema.unitId` es `z.string().uuid()` con la nota
  de que R15 esta derogado (lineas 313-315), sin citarlo como vigente; la 239 es hoy
  `RecipeLineView = { … quantity, unitId }` (linea 354); la 284 queda cubierta por 6b.4; la
  609 dejo de prometer la cobertura inexistente (hoy las filas 748-749 separan lo que el
  test unitario puede cerrar de lo que solo cierra Postgres); la 632 ya no promete que QC-32
  actualizara nada. **Coincide.**
- **Alternativas descartadas** (lineas 660-675): dejar R15 como texto libre y abrir ficha
  posterior — descartada porque el PR no compilaria contra `dev` — y poner el adaptador de
  `UnitCatalog` dentro de `recetas` — descartada porque obligaria a `recetas` a consultar
  `prisma.unit`. Cumple `CHECKPOINTS.md > Especificacion`.
- **La contradiccion que la ronda 1 no vio** (tres vs. cuatro puertos): corregida en
  `design.md:137` y `:738`. El codigo monta **cuatro** (`recipes`, `products`, `units`,
  `images`) y `authorization.test.ts` monta dobles de los cuatro. Bien cazada por
  `spec_author`. Queda un residuo en `tasks.md` — menor-9.

## Checklist

### Especificacion
- [x] `requirements.md` con EARS `R1`-`R50`, R15 tachado y derogado con motivo.
- [x] `design.md` con alternativas descartadas **y ya refleja R50** (MAYOR-2 cerrado).
- [x] `tasks.md`: el barrido de casillas sin marcar no devuelve **ninguna**.

### Trazabilidad
- [x] Los 50 requisitos numerados figuran en la tabla `R<n> -> test`. **R15 esta contado
      como derogado, no colado como cubierto**: su fila dice `~~derogado, ver R50~~`, con el
      test viejo tambien tachado. Los 49 vigentes tienen archivo **y nombre** de test.
- [x] R17 cita ya el test que de verdad lo cierra (M1 lo confirma).
- [x] R50 cita `recipe-input.test.ts` (forma) + `recipe-service.test.ts` (existencia) +
      integracion (FK real). M4 y M5 confirman que las dos mitades muerden.
- [x] `progress/impl_QC-25-crud-de-recetas.md` contiene el mapa `R<n> -> test` por tanda.

### Calidad de codigo
- [x] 576 tests verdes corridos por mi en esta ronda; `./init.sh` completo verde (leader).
- [x] E2E: diferido con motivo (D23, R44) porque la ficha no aporta pantalla.
- [n/a] **Multiplataforma**: el diff contra `origin/dev` **no toca `app/`, `components/` ni
      `e2e/`** — comprobado con `git diff --name-only`. No hay `100vh`, `:hover`, target
      tactil ni `font-size` que revisar. `scope.test.ts` (R44) lo vigila ademas por test.
- [x] Dependencias: seccion propia mas abajo.

### Datos y seguridad
- [x] Permiso validado en el SERVICE con test que muerde: `requireAdmin` es la primera linea
      de los cinco casos de uso y `authorization.test.ts` monta dobles de los cuatro puertos
      que lanzan si se les llama, incluidos `get` y `list`.
- [x] RLS: la feature no crea tablas; el diff sobre `db/` es **vacio**. `guard-rls-force`
      sigue verde.
- [x] Acceso a datos solo por Prisma; `@supabase/supabase-js` no esta instalado.
- [x] Sin secretos hardcodeados; `.env.example` declara las tres variables vacias.
- [n/a] Webhooks: la feature no anade ninguno.

### Modulos hexagonales
- [x] `domain/` y `ports/` sin framework, Prisma, `shared` ni adaptadores.
- [x] De otro modulo, solo el contrato via barrel; nunca ruta profunda.
- [x] Ningun driving instancia su driven; `lib/shared/**` sigue siendo hoja del grafo.
- [x] Ningun `'use server'` sale reexportado por el barrel.
- [x] `prisma.product` prohibido en todo `recetas`; `prisma.unit` solo en el adaptador
      driven de `unidades`.
- [x] La logica esta en `domain/`, no en la Server Action.

### Configuracion
- [x] Direccion, bucket y credencial por variables de entorno, leidas en cada invocacion.

### Verificacion final (`CHECKPOINTS.md`)
- [x] `./init.sh` termina en verde.
- [x] `progress/review_<feature>.md` existe y su veredicto es APROBADO.
- [ ] Entrada en `progress/history.md` — pendiente del leader (menor-7).
- [ ] Worktree desmontado o HOLD anotado — pendiente del leader (menor-7).

## Dependencias

- El diff de `package.json` contra `origin/dev` anade **una sola** linea:
  `"@supabase/storage-js": "^2.115.0"`. Ninguna otra.
- Tiene su fila en `docs/dependencias.md` con los cuatro checks, la version instalada ya
  corregida y la aprobacion humana citada; `design.md > 10` la recoge.
- `@supabase/supabase-js` **no** esta ni en `package.json` ni en `node_modules`.
- La consume un solo archivo, detras del puerto
  (`adapters/driven/storage/recipe-image-supabase.ts`), y `scope.test.ts` (R43) impide que
  ningun test la importe.
- Ninguna utilidad escrita a mano duplica una libreria del stack: la paginacion se reutiliza
  de `lib/shared/pagination.ts` (inyectada, porque `domain/` no puede importar `shared`) y
  la validacion es zod.

---

## Hallazgos de la ronda 2

Ningun bloqueante. Los cuatro son documentacion o deuda acotada.

### menor-7 (heredado, sigue abierto y es correcto) — cierre del leader
`CHECKPOINTS.md > Verificacion final` pide entrada en `progress/history.md` y desmontaje del
worktree (o su HOLD anotado en `progress/current.md`). Es trabajo posterior a esta review.

### menor-8 — `design.md:749` conserva una frase que esta review acaba de desmentir
La fila de trazabilidad del test de integracion dice: "Es la garantia que hace mordible el
`deleted_at IS NULL` del adaptador —**hoy se puede borrar esa clausula y nada falla**— y de
la que cuelga la mitad prohibitiva de R46". Esa frase era el diagnostico de MAYOR-1 y hoy es
**falsa**: M1 demuestra que borrar la clausula pone rojo el test. Una linea; conviene
pasarla a pasado ("antes de esta correccion se podia…") para que nadie la lea como
descripcion del estado actual.

### menor-9 — `tasks.md:79` sigue diciendo "los tres puertos"
El criterio de "hecho" de T6 dice que `recipe-service.test.ts` pasa "con dobles de los
**tres** puertos". Son **cuatro** desde R50 (`recipes`, `products`, `units`, `images`).
`design.md` ya se corrigio en sus dos apariciones (lineas 137 y 738); `tasks.md` quedo
atras. Una palabra.

### menor-10 — la traduccion `P2002 -> 'duplicate'` del adaptador no la muerde ningun test
`lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`, `isUniqueNameViolation`.
**Mutacion M10: la hice devolver siempre `false` y los 39 tests de
`tests/integration/recetas` siguieron verdes.**

Por que **no** es bloqueante, a diferencia de MAYOR-1:

- **Ningun test miente.** El test mapeado a R10 ("el indice unico rechaza con SQLSTATE 23505
  la segunda receta viva con el mismo nombre normalizado") prueba con SQL crudo la
  restriccion de la base, y eso si lo hace. El mapeado a R8 prueba que el **dominio**
  traduce el `'duplicate'` del puerto a `DuplicateNameError` con un doble, y eso tambien lo
  hace. Lo que queda sin test es la **costura** entre ambos, que ningun requisito nombra por
  separado. En MAYOR-1 el problema era distinto: un `describe` prometia en su nombre una
  garantia que su cuerpo no comprobaba, y R17 lo citaba como cobertura.
- **El comportamiento real esta verificado, no supuesto**: lo comprobe contra Postgres real
  en esta ronda. `createRecipe` con nombre duplicado devuelve `'duplicate'`, y
  `replaceAliveRecipe` apuntando al nombre de otra receta viva —el camino de escritura
  anidada, el mas dudoso tras la correccion de menor-5— **tambien** devuelve `'duplicate'`.
- El agujero es **anterior** a la correccion de menor-5: con el `sqlStateOf(...) === '23505'`
  de antes tampoco habia test. La correccion no lo introdujo.

Lo que faltaria: un `it` en `recipe-crud.int.test.ts` que llame al **adaptador**
`createRecipe` dos veces con el mismo nombre normalizado y afirme `toBe('duplicate')`. Queda
como deuda anotada, no como condicion de merge.

---

## Veredicto

**APROBADO.**

Los dos hallazgos MAYORES de la ronda 1 estan cerrados, y lo verifique **ejecutando la
mutacion yo mismo**, no leyendo el reporte de quien los corrigio: quitar `deletedAt: null`
pone rojo el test de integracion nuevo (M1), y `design.md` describe hoy lo que el codigo
hace de verdad, contrastado contra `create-recipe.ts`, `update-recipe.ts`,
`unit-catalog-prisma.ts` y `lib/composition/index.ts`.

Las garantias caras aguantan la pregunta de "que linea de produccion puedo borrar sin que
nada se ponga rojo": R17, R45, R46, R47, R48, R49 y R50 mataron cada una su mutacion
(M2-M9), y R41 sigue cerrado pese al ablandamiento de menor-2 (S1, S2). Solo una de las doce
sobrevivio, y su analisis esta arriba: es una costura que ningun requisito reclama y cuyo
comportamiento verifique empiricamente correcto.

Queda para el leader el cierre de menor-7 (`progress/history.md` y worktree) y, si quiere
cerrarlas en la misma vuelta, las dos correcciones de una linea de menor-8 y menor-9.
menor-10 es deuda anotada para una ficha posterior.

---

# RONDA 1 (historico, 2026-09-03) — RECHAZADO

> Se conserva por trazabilidad. Todo lo pendiente que se enumera aqui esta resuelto arriba,
> salvo menor-7.

Aviso de honestidad sobre el metodo de aquella ronda: no se pudieron ejecutar mutaciones
(editar produccion, correr, revertir) porque el entorno bloqueaba la escritura de archivos
de codigo desde este rol. La comprobacion de "que los tests muerdan" se hizo leyendo cada
asercion y barriendo con grep quien referencia cada funcion de produccion. La ronda 2 salda
esa deuda con 12 mutaciones reales.

## Hallazgos de la ronda 1

### MAYOR-1 — el `deleted_at IS NULL` del catalogo de productos no lo probaba ningun test, y el test que decia probarlo no lo hacia
**Archivo:** `lib/modules/inventario/adapters/driven/persistence/product-catalog-prisma.ts:31`
**Test acusado:** `tests/unit/inventario/product-catalog.test.ts:26-32`
**Trazabilidad afectada:** R17 (y, por dependencia, R46 y la decision cerrada 26)

`findProductRefs` filtra con `where: { id: { in }, deletedAt: null }`. Ese `deletedAt: null`
era **el unico sitio del repo** donde vivia la regla "el catalogo solo devuelve productos
vivos", y sobre ella descansa la mitad prohibitiva de R46 ("anadir un producto dado de baja
se rechaza"). Si se borraba esa clausula, la suite entera seguia verde. El test unitario
tenia un `describe` llamado "findRefs devuelve solo los productos vivos" cuyo unico `it` era
el de la lista vacia — un nombre que promete una garantia y un cuerpo que no la comprueba —,
y `tasks.md` y `design.md:609` lo citaban como el test de R17. El propio comentario de
cabecera remitia a una cobertura de integracion que nunca llego.

**Que faltaba:** un test de integracion contra Postgres real que cree dos productos, borre
logicamente uno, llame a `findProductRefs([vivo, borrado])` y afirme que solo vuelve el
vivo. → **Hecho en `79d1c8a`; verificado con M1 en la ronda 2.**

### MAYOR-2 — `design.md` no reflejaba R50
**Archivo:** `specs/QC-25-crud-de-recetas/design.md`, lineas 54, 201, 239, 284, 609 y 632

El diseno no mencionaba R50 ni una sola vez y seguia describiendo el mundo anterior al merge
de QC-32: la unidad como texto libre, R15 —derogado— citado como vigente, `RecipeLineView`
con `unit`, ninguna mencion de `UnitCatalog`, del adaptador en `unidades` ni de su cableado
en `lib/composition`, y la promesa (linea 632) de que QC-32 actualizaria un test que en
realidad actualizo esta ficha. R50 recorrio requirements -> tasks -> codigo saltandose el
diseno, contra la regla 2 de `CLAUDE.md`. → **Hecho en `e91bc5d`; verificado en la ronda 2.**

### menor-1 — comentario obsoleto en el contrato de `unidades`
`lib/modules/unidades/domain/unit-catalog.ts` decia "Esta ficha NO lo implementa: no hay
consumidor todavia (QC-38/QC-33)". Ya lo habia: QC-25. → cerrado.

### menor-2 — el snapshot completo de `Recipe`/`RecipeLine` es fragil
`scope.test.ts` comparaba el cuerpo **entero** de los dos modelos contra una lista literal
con tipos y atributos Prisma incluidos; ya se habia roto una vez con QC-32 sin que R41 se
violara. R41 solo exige que esta feature no anada columna, indice ni restriccion: basta
afirmar el conjunto de **nombres**. → cerrado, y S1/S2 confirman que no se quedo corto.

### menor-3 — la fila de `docs/dependencias.md` citaba una version que no era la instalada
Decia "ultima release `2.114.0`"; `package.json` fijaba `^2.115.0`. → cerrado.

### menor-4 — la edicion leia del repositorio antes de validar la entrada
`update-recipe.ts`: `findAliveById(id)` corria **antes** del `safeParse`, gastando una
consulta evitable con un cuerpo invalido. → cerrado.

### menor-5 — cualquier `P2002` se traducia a "nombre duplicado"
`isUniqueNameViolation` habria traducido tambien el unico `(recipe_id, product_id)` de
`recipe_lines` a `DuplicateNameError`. Inalcanzable en la practica porque zod rechaza antes
el producto repetido (R16). → cerrado inspeccionando `meta.target`; ver menor-10 para la
cola que dejo.

### menor-6 — una asercion de R48 que no podia fallar
`recipe-image-lifecycle.test.ts:182` comparaba dos dobles construidos por la **misma**
factory: cierto por construccion, no por el comportamiento del codigo. → cerrado.

### menor-7 — cierre pendiente del leader, no del implementer
Entrada en `progress/history.md` y desmontaje del worktree. → **sigue abierto, y es
correcto que lo este.**

## Lo que la ronda 1 dio por bueno y la ronda 2 confirmo con mutaciones

Autorizacion validada en el service, con un test que monta dobles de los cuatro puertos que
lanzan si se les llama —incluidos `get` y `list`: el Operador no lee—; los tres estados de
la imagen sin colapsar (`.nullable().optional()`, nunca `.default()`); un solo `remove` para
los dos caminos de borrado, siempre **despues** de que la base confirme, con el orden
afirmado como array `['replaceAlive', 'remove']`; un `remove` que falla devuelto como
advertencia con contexto y nunca como reversion; la conciliacion de lineas en una sola
`prisma.$transaction` con borrado **fisico** de la linea que desaparece; R45/R46 resueltos
con una diferencia de conjuntos real y aserciones de argumentos exactos; R50 pasando por el
contrato publico de `unidades` con el mismo patron que `inventario`, sin derivar la unidad
del producto y sin resolver su nombre al leer; la frontera de modulos sin rutas profundas ni
framework en `domain/`; y ningun censo global del repo entre las aserciones nuevas — al
contrario, esta ficha **retiro** censos heredados que ya no eran ciertos, con el motivo
escrito en cada uno.
