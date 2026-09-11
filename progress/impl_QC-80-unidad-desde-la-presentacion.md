# QC-80 — unidad-desde-la-presentacion · bitacora de implementacion

> Escrita por el `implementer`. El spec manda (`specs/QC-80-unidad-desde-la-presentacion/`).
> Worktree: `.worktrees/QC-80-unidad-desde-la-presentacion`, rama
> `feature/QC-80-unidad-desde-la-presentacion`, nacida de `origin/dev` en `13fc41c`.

## Preparacion del worktree

El worktree venia sin `node_modules` ni `.env` (son archivos ignorados: `git worktree add` no
los copia). Antes de la primera task se hizo `pnpm install --frozen-lockfile`, se copio el `.env`
del checkout principal y se corrio `pnpm prisma generate`. **No se toco `package.json` ni
`pnpm-lock.yaml`** (regla 7: ninguna dependencia nueva, `design.md > 9`).

## Tasks

### T0 — retirar la guardia de alcance de QC-90 _(bloqueante, hecha primero)_

`tests/unit/inventario/schema/inventario-schema.test.ts` llevaba el bloque
`describe('QC-90 R29 ...')` con **dos** casos que comparaban `db/migrations/` contra el merge-base
con `origin/dev` y fallaban si la rama agregaba una carpeta de migracion. QC-80 agrega
exactamente una, asi que ese bloque se habria puesto rojo **el primer dia por hacer lo que la
ficha tiene que hacer**. Era una guardia de **alcance de QC-90**, ya mergeada: su trabajo
termino. Se retiraron los dos casos y sus ayudantes de censo por git (`archivosAgregadosEnLaRama`,
`carpetasDeMigracionEn` y el import de `node:child_process`).

**Se conservo** el caso de las columnas del lote, que pasa a ser la guardia de **R25** y se
renombro con la cita del requisito; el `describe` pasa a
`QC-80 R25 — la presentacion sigue viviendo solo en product_batches`.

Salida real: `pnpm vitest run tests/unit/inventario/schema/inventario-schema.test.ts` ->
`Test Files 1 passed (1) · Tests 22 passed (22)`; `pnpm exec vitest run guard` ->
`27 passed · 277 passed | 4 skipped`.

### T1 — migracion `20260911120000_presentation_unit`

Escrita **a mano**, no con `prisma migrate dev` (`design.md > 2`): `units` y `presentations` cargan
objetos que Prisma no modela —indices parciales, disparador, RLS— y `migrate dev` los lee como
drift y propone resetear una base con datos reales.

**La mina que el spec habia detectado y que esta migracion desactiva**: el relleno suelta el
`FORCE ROW LEVEL SECURITY` de **`units` ademas del de `presentations`**. `FORCE` aplica las
policies tambien al dueno de la tabla —que es con quien conecta Prisma— y, **sin ninguna policy,
eso deniega tambien el `SELECT`**. Sin soltar `units`, el `SELECT` que resuelve `kilogramo`
habria devuelto cero filas y la migracion habria abortado **por el sitio equivocado**, con un
mensaje culpando al catalogo de no tener la unidad que si tiene.

Verificacion real contra la base local:

| Comprobacion | Resultado |
|---|---|
| `pnpm run db:migrate` | `Applying migration '20260911120000_presentation_unit'` -> `All migrations have been successfully applied.` |
| presentaciones con `unit_id` = id de `kilogramo` | **114** |
| presentaciones con `unit_id` nulo | **0** |
| filas de `units` antes y despues | **6 y 6** (R5: ni un `INSERT` ni un `DELETE`) |
| `presentations.unit_id` | `is_nullable = NO`, sin default (R1) |
| `presentations_unit_id_fkey` | `rc` = `ON DELETE RESTRICT` / `ON UPDATE CASCADE` (R2) |
| `products.unit_id` / indice / FK | `0 / 0 / 0` — se fueron los tres (R7) |
| `pg_policies` sobre las dos tablas | **0**, con RLS `enable`+`force` en ambas (R6) |
| `pnpm run db:rollback` | `20260911120000_presentation_unit revertida.`; `products.unit_id` vuelve anulable con su FK `rc` y su indice, 114 presentaciones y 6 unidades intactas, `_prisma_migrations` coherente |
| reaplicacion | `pnpm run db:migrate` la vuelve a aplicar limpia |

### T2 — `db/schema.prisma`

`Presentation` gana `unitId String @map("unit_id") @db.Uuid` (NOT NULL, sin `@default`) y
`@@index([unitId], map: "presentations_unit_id_idx")`. `Product` pierde `unitId` y su `@@index`.

`unitId` es **escalar SIN `@relation`**, a proposito: `Unit` es del modulo `unidades` y
`Presentation` de `inventario`, asi que con `@relation` el cliente Prisma dejaria a `inventario`
atravesar a `units` con un `include` —un cruce de modulos que **ninguna guardia detecta**, porque
no es un import—. **Consecuencia anotada en el `///` del modelo**: la FK vive en el
`migration.sql` y es **drift** para Prisma, asi que toda migracion futura de `presentations` hay
que revisarla a mano.

### T3 — tests de esquema y migracion

Nuevo `tests/unit/inventario/schema/presentation-unit-migration.test.ts`: **10 casos**, cada uno
citando su `R<n>`, con **12 predicados puros exportados** aplicados **dos veces** —al SQL real y a
una copia **mutada en memoria**; el archivo en disco no se toca—, patron de
`tests/unit/unidades/schema/unidades-migration.test.ts`. Entre las mutaciones esta la de la mina:
**quitar el `NO FORCE` de `units`**.

**Hallazgo del patron, anotado en el propio test y que merece viajar**: `upSource.replace(/ON
DELETE RESTRICT/i, ...)` **sin la bandera `g`** mutaba la **cabecera en comentario** en vez de la
FK, y dejaba el caso verde sin probar nada. Un test que no puede fallar no vigila nada, y este
podia no fallar por un detalle de una sola letra. Ahora lleva `g` y ademas **afirma que la
sentencia ejecutable mutó**.

En `inventario-schema.test.ts` se **invirtieron** los casos que afirmaban lo contrario de lo que
esta ficha decide: `PRODUCT_BUSINESS_FIELDS` pierde `['unitId','unit_id']`, `OPTIONAL_FIELDS`
pierde `'unitId'`, el caso «unitId es uuid opcional» pasa a «`R7:` Product no declara ninguna
unidad» y el censo de indices de `Product` pasa de `['products_unit_id_idx']` a `[]`. Y se
anadieron los simetricos: R1 (`Presentation.unitId` obligatorio, sin default, escalar sin
`@relation`), R25, R26, R28 y R9.

Salida real: `pnpm exec vitest run tests/unit/inventario/schema/` ->
`Test Files 6 passed (6) · Tests 94 passed (94) · Duration 1.18s`.

### T4-T7 — el modulo `inventario`, lado presentacion

`createPresentationSchema` gana `unitId: z.string().uuid()` obligatorio (sin `default`, sin
`nullish`) y `updatePresentationSchema` lo hereda: la edicion sigue siendo **reemplazo completo**.
`PresentationView` gana `unitId`. El puerto pasa de cuatro argumentos posicionales a un dato con
nombre (`PresentationData`) y **`rename` pasa a llamarse `replace`**: un metodo llamado `rename`
que ademas escribe la unidad es un nombre que miente, y el unico sitio donde se nota que miente es
dentro del adaptador.

**Lo delicado, y se resolvio como pedia el spec**: `P2003` llega ahora desde **dos** sitios y se
traduce **por funcion, nunca con un `catch` comun**. Al borrar sigue siendo `'in_use'` —lo dispara
`product_batches_presentation_id_fkey`, y de paso se corrigio el comentario que aun nombraba la
vieja `products_presentation_id_fkey`, desactualizado desde QC-90—; al crear o reemplazar solo
puede venir de `presentations_unit_id_fkey`, o sea `'invalid_unit'`, que el caso de uso convierte
en `ValidationError`. Son dos predicados con nombre propio: `isPresentationInUseViolation` e
`isUnitForeignKeyViolation`.

**La existencia de la unidad NO se comprueba con un `SELECT` previo**: entre el `SELECT` y el
`INSERT` cabe otra transaccion, asi que no cerraria nada. La FK es la garantia; el adaptador
traduce su fallo. Es el mismo criterio por el que este puerto no tiene ningun `findBy` para la
unicidad del nombre.

Decisiones que el spec no traia y se tomaron:
- `presentation-prisma.ts` no tenia funcion pura de mapeo; se anadio `toPresentationView(row)` y se
  exporto `presentationSelect`, para poder probar «fila -> `PresentationView` con `unitId`» **como
  dato y no como texto**, igual que ya hacia `toProductView`.
- **`PresentationData` NO se exporta desde el barrel**: nadie fuera del modulo lo consume y la regla
  del barrel es reexportar solo de `./domain`. El barrel no cambio.
- Los fixtures de integracion resuelven `kilogramo` con un helper local por `nameNormalized` +
  `companyId: null`, **ningun uuid escrito a mano** y ningun aserto cambiado.

Salidas reales: los 5 archivos de presentacion -> `Test Files 5 passed (5) · Tests 66 passed (66)`;
`pnpm exec vitest run guard` -> `27 passed · 277 passed | 4 skipped`; `pnpm run lint` limpio.

### T8 — el selector de unidad

`app/(private)/configuracion/presentaciones/components/presentation-unit-select.tsx`, cliente, **no
controlado** (el panel entero es un `<form action>`, asi que el valor viaja en el `FormData` como
`unitId`), sobre el primitivo `Select`. Etiqueta `unit.symbol ?? unit.name`.

**Local y no promovido**, por la alternativa C del `design.md`: el `UnitSelect` de proveedores tiene
como API central la opcion «sin unidad» (`NO_UNIT_VALUE`), que aqui es **exactamente lo prohibido**
(R17). Promoverlo pedia una bandera `allowEmpty` y tocar una feature ajena y cerrada.

**Sin opcion «sin unidad»** y **cumpliendo la regla multiplataforma sin declarar excepcion**:
`min-h-11 min-w-11` y `text-base md:text-base`, con caso de test del tamano —que es la leccion que
QC-90 se llevo por dejar un disparador en `size-6`—.

Decision no prevista: cada `SelectItem` lleva `data-value={unit.id}` (patron ya usado en
`order-form.tsx`), porque Base UI **no expone el valor de la opcion en el DOM** y sin eso la
afirmacion en negativo de R17 —«ninguna opcion con `value=""`»— no seria verificable de verdad.

Salida real: `Test Files 1 passed (1) · Tests 8 passed (8)`.

### T10-T11 — el producto deja de declarar unidad y pasa a derivarla

`unitId` desaparece de `product-input.ts`, `NewProduct`, `ProductRef`, `product-queryable.ts`
(era filtrable como `select`), `PRODUCT_SELECT`, `createProduct`, `updateAliveProduct`, el `where`
del filtro, `product-catalog-prisma.ts`, `buildProductFields` y las columnas ocultas del listado.
`ProductRef.unitId` se retira **sin sustituto**: nadie lo consume —`recetas` pide `findRefs` para
saber si el producto esta vivo y para su nombre; la unidad de la linea es `recipe_lines.unit_id`,
que es suya—.

`ProductView.unitId` **se elimina** y nace `ProductView.latestBatchUnitId: UnitId | null`. El
renombrado es deliberado: obliga al typecheck a **visitar cada consumidor** en vez de dejar un campo
llamandose igual y queriendo decir otra cosa. «Mas reciente» es `created_at DESC` **desempatando por
`id DESC`** —no hay fecha de compra todavia (QC-81) y sin desempate dos lotes del mismo instante
darian resultados distintos entre consultas—.

**Desviacion del `design.md` que hubo que tomar, y esta comentada en el archivo**: el fragmento
`LATEST_BATCH_UNIT` **no puede ser `as const`**, como lo escribia el design. Prisma exige un
`orderBy` **mutable** y un `readonly [...]` no compila. Va con
`satisfies Prisma.Product$batchesArgs`.

Otras dos decisiones no previstas:
- En `product-columns.tsx` la columna oculta se **renombra** `'unitId'` -> `'latestBatchUnitId'`. Si
  se quitaba sin mas, el uuid derivado pasaba a ser un id de columna valido.
- **No se anade ningun indice** (`product_batches_product_id_idx` ya localiza los lotes de un
  producto). El compuesto `(product_id, created_at DESC)` queda **escrito como comentario**, para el
  dia que haga falta.

Coste aceptado y consciente: `listAlive` —la consulta mas caliente, que ademas sirve al autocomplete
con `pageSize` maximo— emite **una consulta correlacionada mas por pagina** (no por fila). Se acepta
porque el contrato **no se ensancha** (el campo ya existia, cambia su origen) y porque la
alternativa ponia una llamada de red en mitad de un `onSelect` hoy sincrono.

Salida real: `tests/unit/inventario/` + `tests/guards/` ->
`Test Files 51 passed / Tests 635 passed`, con un unico rojo de otra tanda ya cerrado despues.

### T9 — formulario, panel y seccion

Las unidades se piden **una sola vez por pantalla** con `listUnitsAction()` en la seccion, en
`Promise.all` con el listado, y bajan por props hasta el formulario, que no consulta nada (patron de
QC-44 R46). `PRESENTATION_BUSINESS_FIELDS` gana `unitId` —es la fuente unica de los campos que el
formulario captura, y recorrerla es lo que hace que anadir uno sin anadirlo ahi **se note**—.
`PresentationSheetTarget` pasa a `Pick<PresentationView, 'id' | 'name' | 'unitId'>`, asi que la
edicion precarga la unidad **derivada del contrato** (R15).

**R19 resuelto entero**: si `listUnitsAction()` responde error, la seccion pinta
`PresentationListError` y **no monta ningun `PresentationSheet`** —ni el de la cabecera, ni el de
«crear la primera», ni el de la fila—. Un formulario con el selector vacio seria peor que el error:
dejaria al usuario delante de un campo obligatorio imposible de rellenar.

**La lista NO gana columna de unidad**, deliberado: pintarla abre una pregunta que nadie hizo (el
nombre?, el simbolo?, resuelto contra que catalogo?). Coste aceptado y con caso en negativo que lo
vigila.

Decisiones no previstas:
- `PRESENTATION_COLUMNS` pasa de constante a `buildPresentationColumns(units)`, memoizada. La celda
  de acciones monta el panel de edicion y necesita el catalogo, que **solo existe en ejecucion**;
  es el mecanismo de `buildOrderColumns` (QC-35).
- `initialUnitId` usa `??` y **no `||`**: tras un rechazo, `values.unitId === ''` significa «no
  eligio» y tiene que volver al marcador, **no** a la unidad previa. Con `||` habria vuelto a la
  previa, que es justo la mentira que R18 no quiere.

Salida real: `pnpm exec vitest run tests/unit/configuracion-ui/` ->
`Test Files 25 passed (25) · Tests 350 passed (350)`.

### T12 — la linea de receta, sin cambiar ninguna regla

`recipe-lines-field.tsx` sigue llamando a `resolveLineUnitId` y `unitsOfGroup` igual que hoy y la
**logica de `unit-group.ts` no se toca**: con `unitId === null` ya devuelve el catalogo entero, que
es exactamente lo que R23 pide para un producto sin lotes. Lo que cambia es la **fuente** del dato
—`latestBatchUnitId`— y el comentario que la explica, incluido que `null` significa «este producto
todavia no tiene ningun lote», no «no se pudo leer». Se cerraron ademas los dos consumidores de una
linea en `formulas/nueva/page.tsx` y `formulas/[id]/page.tsx`.

### Huerfanos de contrato, cerrados aparte

Dos cambios de contrato —`NewProduct` sin unidad y `createPresentationSchema` con `unitId`
obligatorio— dejaron consumidores que **ninguna task reclamaba**: `create-product.ts` seguia
construyendo `unitId: entrada.unitId ?? null`; un caso de `product-input.test.ts` fallaba por
**el campo que no era su sujeto** (probaba el limite de 60 caracteres del nombre); y
`tests/unit/unidades/schema/unidades-schema.test.ts` tenia 3 casos afirmando cosas sobre
`Product.unitId`.

Los tres casos de `unidades-schema` **no se borraron**: se reescribieron en positivo —el producto
**no** declara unidad (R21) y quien la declara es `Presentation` (R1, escalar sin `@relation`)— y se
anadio `expect(has(unit,'presentations')).toBe(false)`, que es **la coleccion de vuelta que colaria
un `@relation`** en `Presentation.unitId` y por tanto la guardia real de la frontera entre
`unidades` e `inventario`.

**Leccion que este ciclo deja escrita**: `vitest` **no typechequea**, asi que una docena de archivos
de test estaban **verdes y rotos a la vez**. El unico que los delata es `pnpm run typecheck`, y por
eso el gate corre los dos.

### Fuera del `tasks.md`: el SEGUNDO camino de alta de presentacion (R11)

El `tasks.md` no lo listaba y por poco se escapa. `components/shared/presentation-select.tsx` tiene
un **alta rapida de presentacion embebida** y hacia `createPresentationSchema.safeParse({ name })`
**sin `unitId`**. Como R10 volvio ese campo obligatorio, el alta **se quedaba muerta en la
validacion previa y no llegaba nunca a la Server Action**, en sus **dos** consumidores: el detalle
de proveedor y el formulario de producto.

**No era un rojo ajeno: era un incumplimiento de R11**, que dice literalmente que «NO DEBE existir
ningun camino que cree una presentacion sin unidad». T9 solo toco la pantalla de presentaciones y
este componente compartido quedo fuera del spec. Lo delato el rojo de
`tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`.

**Desviacion del `design.md` que hay que anotar**: el selector de unidad **ya no vive donde dice
`design.md > 5.1`**. Se **promovio** de `app/(private)/configuracion/presentaciones/components/` a
`components/shared/presentation-unit-select.tsx`, porque dejarlo donde estaba obligaba a que
`components/shared/` importara de `app/` —**inversion de capas**— y porque ahora hay **dos
consumidores obligatorios** con la misma API, que es justo el umbral de promocion que
`docs/architecture.md > Componentes` describe. Gano tres props **aditivas**: `name` —con `null`
para no aportar campo al formulario anfitrion, porque la linea de catalogo ya tiene su propio
`unitId`— y `value`/`onValueChange` para el modo controlado, necesario porque el alta rapida no es
un `<form>`. El barrel de presentaciones lo republica, asi que ningun consumidor de la ruta vieja
cambio.

Coherente con R19: **si no hay catalogo de unidades, el alta rapida no se ofrece**; elegir una
presentacion ya existente sigue funcionando.

## Archivos tocados

**93 archivos.** Por zona:

| Zona | Archivos |
|---|---|
| `db/` | `schema.prisma` y la migracion nueva `20260911120000_presentation_unit/{migration,down}.sql` |
| `lib/modules/inventario/domain/` | 9: `presentation-input`, `presentation-view`, `create-presentation`, `update-presentation`, `product-input`, `product-view`, `product-catalog`, `product-queryable`, `create-product` |
| `lib/modules/inventario/` resto | `ports/presentation-repository`, `adapters/driven/persistence/{presentation,product,product-catalog}-prisma`, `adapters/driving/{presentation,product}-actions` |
| `lib/composition/`, `lib/modules/unidades/` | `index.ts`; `unit-write-prisma.ts`, un comentario que nombraba una FK inexistente |
| `components/shared/` | `presentation-unit-select.tsx` (**promovido**) y `presentation-select.tsx` |
| `app/(private)/` | 8 de presentaciones, 4 de inventario, 3 de formulas, 1 de proveedores |
| `tests/` | 14 unit de inventario, 8 de configuracion-ui, 8 de integracion de inventario, 4 de recetas-ui, 4 de proveedores-ui, 2 de recetas, 2 de schema, 3 de integracion de proveedores, 2 de unidades, 1 guardia |

**`package.json` y `pnpm-lock.yaml` NO se tocaron** (regla 7).

## Mapa requisito -> test

Los **28 requisitos** tienen test. Cada caso cita su `R<n>` en el nombre.

| R | Donde se prueba |
|---|---|
| R1 | `schema/presentation-unit-migration.test.ts` (NOT NULL, sin default) · `inventario-schema.test.ts` · `inventario-constraints.int.test.ts`: `INSERT` sin `unit_id` -> `23502` |
| R2 | `presentation-unit-migration.test.ts` (FK `RESTRICT`/`CASCADE`, y **no** `SET NULL`) · `inventario-constraints.int.test.ts`: borrar unidad referenciada -> **`23503`**, presentacion intacta |
| R3 | `presentation-unit-migration.test.ts` · `list-query-indexes.int.test.ts`, donde el indice nuevo **releva** al que se fue |
| R4 | `presentation-unit-migration.test.ts`: busca `kilogramo` por `name_normalized` y nunca por uuid, con sus dos `RAISE EXCEPTION` |
| R5 | `presentation-unit-migration.test.ts`: cero `INSERT`/`DELETE`/`TRUNCATE` sobre `presentations` y `units` |
| R6 | `presentation-unit-migration.test.ts`: `NO FORCE` -> `ENABLE`+`FORCE` en **las dos** tablas, sin `CREATE POLICY` |
| R7 | `presentation-unit-migration.test.ts` · `inventario-schema.test.ts` · `unidades-schema.test.ts` · `product-crud.int.test.ts` |
| R8 | `presentation-unit-migration.test.ts`, dos casos: reversion exacta y censo de contrarias up/down |
| R9 | `presentation-unit-migration.test.ts` · `inventario-schema.test.ts`: sin `deleted_at`, marcas en ingles |
| R10 | `presentation-input.test.ts`: uuid valido; rechaza ausencia, vacio y no-uuid senalando `unitId` · `presentation-service.test.ts` |
| R11 | `presentation-service.test.ts` · `presentation-actions.test.ts` · **`catalog-line-sheet.test.tsx` y `product-page.test.tsx`**: el alta rapida manda la unidad |
| R12 | `presentation-service.test.ts` · `presentation-prisma.test.ts` · `presentation-unit.int.test.ts`: reemplaza la unidad, con y sin cambiar el nombre |
| R13 | `presentation-service.test.ts` (distinguible del duplicado) · `presentation-prisma.test.ts` (las dos traducciones de `P2003`) · `presentation-unit.int.test.ts`: unidad inexistente -> `invalid_input`, cero filas |
| R14 | `presentation-service.test.ts`: actor sin permiso, **sin una sola llamada al repositorio** · `authorization.test.ts` |
| R15 | `presentation-prisma.test.ts` · `presentation-sheet.test.tsx`: la edicion precarga su unidad |
| R16 | `presentation-unit-select.test.tsx`: pinta todas las del catalogo · `presentation-page.test.tsx` |
| R17 | `presentation-unit-select.test.tsx`: **ninguna** opcion con valor vacio · `presentation-sheet.test.tsx` · `catalog-line-sheet.test.tsx` · `product-page.test.tsx` |
| R18 | `presentation-sheet.test.tsx`: tras el rechazo el panel sigue abierto con nombre **y** unidad |
| R19 | `presentation-page.test.tsx`: catalogo en error -> sin disparador de alta ni de edicion · `product-page.test.tsx`: alta rapida no ofrecida |
| R20 | `presentation-unit-select.test.tsx`: objetivo tactil y 16 px en todos los anchos · `configuracion-viewport.test.tsx` |
| R21 | `product-input.test.ts` · `product-actions.test.ts` · `product-catalog.test.ts` · `product-page.test.tsx` · `list-query.test.ts` · `guard-contrato-listados.test.ts` · `unidades-schema.test.ts` |
| R22 | `product-prisma.test.ts`: un lote; varios, gana el mas reciente; desempate por `id` desc; `orderBy`/`take:1` afirmados **como dato** · `list-query-products.int.test.ts` |
| R23 | `product-prisma.test.ts`: sin lotes -> `null` · `recipe-line-unit-group.test.tsx` · `unit-group.test.ts` · `recipe-form.test.tsx`: la receta se guarda · `list-query-products.int.test.ts` |
| R24 | `recipe-line-unit-group.test.tsx`: solo su grupo, y preselecciona la mas pequena salvo que la elegida ya sea del grupo |
| R25 | `inventario-schema.test.ts`: la guardia **heredada de QC-90 y reconvertida** · `presentation-unit-migration.test.ts` |
| R26 | `inventario-schema.test.ts`: `SupplierCatalogLine.unitId` sigue opcional · `catalog-line.int.test.ts` |
| R27 | `presentation-unit-select.test.tsx`: no filtra por empresa · `inventario-schema.test.ts`: `presentations` sin columna de empresa |
| R28 | `presentation-unit.int.test.ts`: crear+editar deja el lote **identico** —`toEqual` de la fila entera— y no suma lotes ni pedidos · `inventario-schema.test.ts` |

## Gate

`./init.sh` **completo**, corrido desde el worktree, **dos veces**.

```
Test Files  3 failed | 318 passed (321)
     Tests  3 failed | 4297 passed | 27 skipped (4327)
```

`pnpm run typecheck` **limpio**. `pnpm run lint` **limpio**. `pnpm exec vitest run guard` en verde.

### Los 3 rojos, uno por uno

**Dos estan en `tests/baseline-rojos.json`** y son los estructurales ya conocidos:
`tests/unit/recetas/module-contract.test.ts` y `tests/unit/recetas-ui/recipe-route-contract.test.ts`.
Fallan porque miden `git diff origin/dev...HEAD` y **la rama todavia no tiene ni un commit**, asi que
el rango va vacio y el caso se declara no-concluyente a proposito.

**El tercero —`tests/integration/identity/identity-constraints.int.test.ts > el catalogo arranca solo
con CC`— NO esta en el baseline y NO es de esta rama.** Evidencia, no opinion:

- **Falla tambien en aislado**, asi que **no** es saturacion.
- **Falla igual en `dev`**, corrido desde el checkout principal **sin esta rama encima** — que es
  exactamente la comprobacion que `docs/verification.md` manda hacer cuando se sospecha de una rama.
- La causa es **residuo en la base local compartida**: `document_types` tiene **28** filas —la real
  `CC` mas **27** `DOC%` que dejaron corridas de tests—. El caso afirma un estado **global** del
  catalogo, asi que cualquier residuo lo tumba.
- La migracion de QC-80 **no menciona `document_types` ni `users`**: cero coincidencias en
  `migration.sql` y en `down.sql`.

**No se limpio y no se metio al baseline, a proposito.** Limpiar residuo de tests es **QC-77**, y el
baseline se convierte en «el sitio donde cualquiera mete lo que le estorba» si se usa sin criterio.
Esa decision es del humano, no del implementer.

### Un flake medido, no supuesto

En la **primera** corrida del gate cayo ademas `tests/unit/inventario/product-page.test.tsx`. En la
**segunda no**. Corrido **solo** pasa **38/38**. Es el flake de saturacion que
`docs/verification.md` describe: falla en la suite, pasa en aislado y cambia de sitio entre
corridas. **No se parcheo, para no enmascararlo.**

## Deuda y desviaciones que el reviewer debe mirar

1. **El selector de unidad no esta donde dice `design.md > 5.1`**: se promovio a
   `components/shared/`. Motivo arriba: inversion de capas y dos consumidores obligatorios.
2. **`LATEST_BATCH_UNIT` no puede ser `as const`**, como lo escribia `design.md > 7`: Prisma exige un
   `orderBy` mutable. Va con `satisfies Prisma.Product$batchesArgs`.
3. **El alta rapida de presentacion embebida no estaba en el `tasks.md`** y era un incumplimiento de
   R11. Queda cerrada, pero el spec no la preveia.
4. **`identity-constraints.int.test.ts`** necesita que alguien decida: limpiar el residuo (QC-77) o
   una entrada de baseline con su motivo.
5. **La guardia de alcance de `recetas` se retenso** (`MIGRACION_QC80`). Sin eso, en cuanto la rama
   tuviera su primer commit habria fallado **de verdad**, y el baseline lo habria **escondido**,
   porque la comparacion es por archivo. Se verifico **por los dos lados**: con el retensado pasa;
   quitandolo en memoria devuelve exactamente los dos `.sql` de la migracion.
6. **`vitest` no typechequea.** Una docena de archivos de test estuvieron **verdes y rotos a la vez**
   durante esta implementacion; solo `pnpm run typecheck` los delato.

