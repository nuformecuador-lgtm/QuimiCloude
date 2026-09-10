# QC-70 — errores-centralizados · tasks.md

> `[P]` = puede correr en paralelo con las otras `[P]` de su mismo bloque.
> Cada task lista **los archivos exactos que toca**: la validación de
> `AGENTS.md > Paralelismo` se hace contra este archivo.
> Cierre de tanda con `./init.sh --rapido`; cierre de feature y pre-PR con `./init.sh` completo.

## ⚠ Lee esto antes de T1: el choque con QC-39

QC-70 **renombra dos códigos de `unidades`** que la pantalla de QC-39 (`in_progress`, otro
worktree) ya consume:

| Valor viejo | Valor nuevo |
|---|---|
| `duplicate_name` | `unit_duplicate_name` |
| `not_found` | `unit_not_found` |

Los archivos de QC-39 que los comparan **no existen todavía en `dev`**
(`app/(private)/configuracion/unidades/**`, `tests/unit/configuracion-ui/**`), así que **el merge
sale limpio y el fallo no aparece hasta que alguien abre la pantalla**. Quien mergee segundo
actualiza los dos literales. Las dos features tocan además `lib/modules/unidades/index.ts` (T8).

---

## Bloque A — El catálogo (nada depende de nada)

### [x] T1 · Módulo `errores`: códigos, claves y mensajes
**Depende de:** nada.
**Toca:**
- `lib/modules/errores/index.ts` (nuevo)
- `lib/modules/errores/domain/error-codes.ts` (nuevo)
- `lib/modules/errores/domain/error-catalog.ts` (nuevo)
- `lib/modules/errores/domain/error-message.ts` (nuevo)
- `tests/unit/errores/catalogo.test.ts` (nuevo)

**Hecho cuando:** existen las 25 entradas de `design.md > 3` con su código, su clave y su texto;
`ErrorCode` es la unión cerrada de los literales; `errorMessage(code)` devuelve el texto; el test
comprueba que no hay claves ni textos repetidos (R4), que ningún código es numérico y todos
casan `^[a-z][a-z_]*$` (R3), que `not_found` y `duplicate_name` **no** están (R16), que sí están
los siete `*_not_found` (R17) y los cuatro `*_duplicate_name` (R18), que los trece códigos
congelados siguen con su valor (R19), y que ningún código de `identity` aparece (R25). Un caso
con `@ts-expect-error` fija que un código inventado no compila (R2). `./init.sh --rapido` verde.

### [x] T2 · El traductor único
**Depende de:** T1.
**Toca:**
- `lib/modules/errores/domain/error-state.ts` (nuevo)
- `lib/modules/errores/index.ts`
- `tests/unit/errores/to-error-state.test.ts` (nuevo)

**Hecho cuando:** `createErrorStateTranslator(base, log?)` devuelve el estado con el código de la
clase y el mensaje del catálogo para un error de la familia (R11); devuelve `unexpected` con su
mensaje neutro para cualquier otro (R12); el test alimenta un
`new Error('relation "orders" does not exist at line 42')` y comprueba que **ni el mensaje ni
ningún campo del estado contienen `orders`, `relation` ni `line 42`** (R13); el espía de `log`
recibe el error original exactamente una vez (R14); `ErrorState.reference` está declarado
opcional y sale `undefined` en los dos caminos (R15); y **el diagnóstico va al log y no al
estado**: con un error de dominio que lleva `diagnostic: 'de PENDIENTE a ENTREGADO'`, el espía lo
recibe y `JSON.stringify(state)` **no** contiene esa cadena, y `Object.keys(state)` está contenido
en `['status','code','message','reference']` (R28, R29). `./init.sh --rapido` verde.

### [x] T3 · La guardia del catálogo
**Depende de:** T1, T2.
**Toca:**
- `tests/guards/guard-catalogo-de-errores.test.ts` (nuevo)

**Hecho cuando:** las **nueve** comprobaciones de `design.md > 5` están implementadas como funciones
puras exportadas; cada una tiene **un caso que muerde** (entrada sintética que viola la regla →
hallazgo con archivo y código nombrados) y **un caso limpio** (→ lista vacía); el caso que lee el
repositorio real sale **rojo ahora** (los módulos todavía declaran `not_found`) y se documenta
como esperado hasta T8. `./init.sh --rapido` verde salvo ese caso, que se marca `.skip` con el
motivo escrito y se desmarca en T9.

**Los dos casos que el humano pidió explícitos (R30)**, y que son los que hacen que el diagnóstico
no pueda cruzar mañana: el **8** lee la declaración de `ErrorState` y da rojo si aparece cualquier
campo fuera de `status`/`code`/`message`/`reference` —el caso que muerde le pasa un tipo con
`diagnostic: string` añadido—; el **9** da rojo si `app/**`, `components/**` o un
`adapters/driving/**` leen `.diagnostic`, o si el traductor construye el estado con `...error` o
`Object.assign`.

---

## Bloque B — Migración de los cinco módulos

Cada task migra un módulo entero: base, clases, sitios de lanzamiento, barrel, adaptador(es)
driving y sus tests. **No comparten ningún archivo entre sí**, así que las cinco son `[P]` una
vez cerrado T2.

### [x] T4 [P] · `inventario`
**Depende de:** T2.
**Toca:**
- `lib/modules/inventario/domain/errors.ts`
- `lib/modules/inventario/domain/get-product.ts`, `update-product.ts`, `delete-product.ts`
- `lib/modules/inventario/domain/create-presentation.ts`, `update-presentation.ts`, `delete-presentation.ts`
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`
- `lib/modules/inventario/adapters/driving/product-actions.ts`
- `lib/modules/inventario/adapters/driving/presentation-actions.ts`
- `lib/modules/inventario/index.ts`
- `tests/unit/inventario/product-actions.test.ts`, `tests/unit/inventario/presentation-actions.test.ts`, `tests/unit/inventario/presentation-service.test.ts`

**Hecho cuando:** `NotFoundError` está partido en `ProductNotFoundError` y
`PresentationNotFoundError`, `DuplicateNameError` es `PresentationDuplicateNameError`, la base ya
no acepta mensaje (R7), las **dos** copias de `toErrorState` han desaparecido y en su sitio hay
`createErrorStateTranslator(InventarioError)` (R10), y los tests de acciones fijan el código
nuevo y el estado `unexpected` donde antes esperaban `rejects.toBe(ajeno)` (R12, ver pregunta
abierta 3). `./init.sh --rapido` verde.

### [x] T5 [P] · `pedidos`
**Depende de:** T2.
**Toca:**
- `lib/modules/pedidos/domain/errors.ts`
- `lib/modules/pedidos/domain/get-order.ts`, `update-order.ts`, `cancel-order.ts`, `delete-order.ts`, `create-order.ts`, `order-transitions.ts`
- `lib/modules/pedidos/adapters/driving/order-actions.ts`
- `lib/modules/pedidos/index.ts`
- `tests/unit/pedidos/order-actions.test.ts`, `tests/unit/pedidos/order-prisma-errors.test.ts`

**Hecho cuando:** `NotFoundError` es `OrderNotFoundError` (`order_not_found`), `RecipeNotFoundError`
conserva su código y toma el texto compartido del catálogo, `assertTransition` ya no compone el
texto con `from`/`to` sino que los pasa como **diagnóstico** (R7, R28) —y su test comprueba que el
`message` es el del catálogo y que `from`/`to` aparecen solo en el diagnóstico—, la copia de
`toErrorState` ha desaparecido, y
`INVALID_INPUT_CODE` sale del catálogo en vez de ser un literal local. `./init.sh --rapido` verde.

### [x] T6 [P] · `proveedores`
**Depende de:** T2.
**Toca:**
- `lib/modules/proveedores/domain/errors.ts`
- `lib/modules/proveedores/domain/get-supplier.ts`, `update-supplier.ts`, `delete-supplier.ts`, `create-supplier.ts`
- `lib/modules/proveedores/domain/create-catalog-line.ts`, `update-catalog-line.ts`, `delete-catalog-line.ts`, `list-catalog-lines.ts`
- `lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts`
- `lib/modules/proveedores/adapters/driving/supplier-actions.ts`
- `lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts`
- `lib/modules/proveedores/index.ts`
- `tests/unit/proveedores/supplier-actions.test.ts`, `tests/unit/proveedores/catalog-line-fk.test.ts`

**Hecho cuando:** `NotFoundError` está partido en `SupplierNotFoundError` y
`CatalogLineNotFoundError` según la tabla de `design.md > 4.1` —los cinco sitios de proveedor y
los dos de línea—, `DuplicateNameError` es `SupplierDuplicateNameError`, y las **dos** copias de
`toErrorState` han desaparecido. `./init.sh --rapido` verde.

### [x] T7 [P] · `recetas`
**Depende de:** T2.
**Toca:**
- `lib/modules/recetas/domain/errors.ts`
- `lib/modules/recetas/domain/get-recipe.ts`, `update-recipe.ts`, `delete-recipe.ts`, `create-recipe.ts`
- `lib/modules/recetas/adapters/driven/persistence/recipe-prisma.ts`
- `lib/modules/recetas/adapters/driving/recipe-actions.ts`
- `lib/modules/recetas/index.ts`
- `tests/unit/recetas/recipe-actions.test.ts`, `tests/unit/recetas/recipe-service.test.ts`

**Hecho cuando:** `NotFoundError` es `RecipeNotFoundError` (`recipe_not_found`, con el texto
compartido con `pedidos`), `DuplicateNameError` es `RecipeDuplicateNameError`, y la copia de
`toErrorState` ha desaparecido. `./init.sh --rapido` verde.

### [x] T8 [P] · `unidades`
**Depende de:** T2.
**Toca:**
- `lib/modules/unidades/domain/errors.ts`
- `lib/modules/unidades/domain/create-unit.ts`, `update-unit.ts`, `delete-unit.ts`, `convert-quantity.ts`
- `lib/modules/unidades/adapters/driving/unit-actions.ts`
- `lib/modules/unidades/index.ts` ← **archivo en conflicto con QC-39** (`design.md > 8`)
- `tests/unit/unidades/unit-actions.test.ts`

**Hecho cuando:** `NotFoundError` es `UnitNotFoundError`, `DuplicateNameError` es
`UnitDuplicateNameError`, los cuatro textos a medida de `convert-quantity.ts` pasan a ser
**mensaje del catálogo + diagnóstico** (R7, R28) —con el test de `convert-quantity` comprobando
que los ids de las unidades y el factor **no** están en `message`—, la copia de `toErrorState` ha
desaparecido, y el diff de `index.ts` se deja lo más pequeño posible (solo la línea de
reexportación de errores) para que el merge con QC-39 sea trivial. **Al cerrar esta task, anota en
el progreso los dos literales renombrados** (`duplicate_name → unit_duplicate_name`,
`not_found → unit_not_found`) para que el leader los tenga a mano en el merge.
`./init.sh --rapido` verde.

### [x] T9 · Desmarcar el caso real de la guardia
**Depende de:** T3, T4, T5, T6, T7, T8.
**Toca:**
- `tests/guards/guard-catalogo-de-errores.test.ts`

**Hecho cuando:** el caso que lee el repositorio real está activo y **verde**: ningún módulo
declara un código fuera del catálogo, no queda ningún `function toErrorState`, ningún constructor
de error admite `message`, y no hay entradas huérfanas. `./init.sh --rapido` verde.

---

## Bloque C — Las pantallas

Cada task toca archivos de una sola ruta; son `[P]` entre sí una vez cerrada la task del módulo
del que dependen.

### [x] T10 [P] · Proveedores
**Depende de:** T6.
**Toca:**
- `app/(private)/proveedores/[id]/page.tsx`
- `app/(private)/proveedores/components/supplier-form.tsx`
- `app/(private)/proveedores/[id]/components/catalog-line-form.tsx`
- `tests/unit/proveedores-ui/supplier-page.test.tsx`, `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`, `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`, `tests/unit/proveedores-ui/delete-catalog-line-dialog.test.tsx`

**Hecho cuando:** la página compara `supplier_not_found`; `supplier-form` compara
`supplier_duplicate_name` y `supplier_not_found`; **`catalog-line-form` trata los dos códigos**
—`catalog_line_not_found` para editar/borrar y `supplier_not_found` para el alta— y cada uno con
su frase; los literales salen del catálogo, no de constantes locales (R20, R21); y
**`supplier-form.tsx:211` deja de sustituir el mensaje del back por su `DUPLICATE_NAME_MESSAGE`
propio** (R32). La validación propia del formulario —campo requerido, `Revisa los campos
marcados`— **se queda como está** (R31).

### [x] T11 [P] · Recetas
**Depende de:** T7.
**Toca:**
- `app/(private)/produccion/formulas/[id]/page.tsx`
- `app/(private)/produccion/formulas/components/recipe-form.tsx`
- `tests/unit/recetas-ui/recipe-form.test.tsx`, `tests/unit/recetas-ui/recipe-page.test.tsx`

**Hecho cuando:** la página compara `recipe_not_found` y el formulario compara
`recipe_duplicate_name` y `recipe_not_found`.

### [x] T12 [P] · Presentaciones e inventario
**Depende de:** T4.
**Toca:**
- `app/(private)/configuracion/presentaciones/components/presentation-form.tsx`
- `app/(private)/configuracion/presentaciones/components/delete-presentation-dialog.tsx`
- `app/(private)/inventario/components/product-form.tsx`
- `components/shared/presentation-select.tsx`
- `tests/unit/configuracion-ui/presentation-sheet.test.tsx`, `tests/unit/configuracion-ui/delete-presentation-dialog.test.tsx` (las pruebas de presentaciones viven en `configuracion-ui/`, no en una carpeta propia)
- `tests/unit/inventario/product-page.test.tsx` (consumidor de `presentation-select`; el otro consumidor, `catalog-line-sheet.test.tsx`, lo toca T10 para no compartir archivo)

**Hecho cuando:** `CODE_TO_FIELD` mapea `presentation_duplicate_name`, `presentation-select`
compara `presentation_duplicate_name` **y pinta el `message` del back en vez de su
`DUPLICATE_NAME_MESSAGE` propio** (R32), `PRESENTATION_IN_USE_CODE` y los `INVALID_INPUT_CODE`
locales salen del catálogo. La validación propia de los formularios no se toca (R31).

### [x] T13 [P] · Pedidos
**Depende de:** T5.
**Toca:**
- `app/(private)/pedidos/components/order-form.tsx`
- `app/(private)/pedidos/components/cancel-order-dialog.tsx`
- `tests/unit/pedidos-ui/order-form.test.tsx`, `tests/unit/pedidos-ui/cancel-order-dialog.test.tsx`, `tests/unit/pedidos-ui/order-sheet.test.tsx`

**Hecho cuando:** ningún código cambia de valor, `CODE_TO_FIELD` está tipado con `ErrorCode` y el
`invalid_input` fabricado por el diálogo sale del catálogo (R21).

---

## Bloque D — Cierre

### [x] T14 · Barrido de literales sueltos
**Depende de:** T10, T11, T12, T13.
**Toca:** lo que aparezca (se espera que nada).

**Hecho cuando:** una búsqueda de `'not_found'` y `'duplicate_name'` en `app/**`,
`components/**`, `hooks/**` y `lib/**` no devuelve ninguna comparación viva, y el caso 7 de la
guardia lo fija para el futuro (R20).

### [x] T15 · El E2E del error inesperado
**Depende de:** T14.
**Toca:**
- `e2e/errores.spec.ts` (nuevo)

**Hecho cuando:** un solo caso provoca desde el navegador una acción que falla con un error **que
no es de dominio**, y comprueba que la pantalla sigue en pie, muestra el mensaje neutro de
`unexpected` y el HTML **no** contiene `Prisma`, `relation`, ningún nombre de tabla ni el
diagnóstico (R33, R13). **Primero se confirma que el camino elegido llega de verdad a Prisma**
(`design.md > 6 ter`); si ninguno alcanzable desde el navegador lo hace, **se para y se dice**, y
no se añade ningún `throw` de mentira en producción para que el caso pase.

### [x] T16 · Trazabilidad y gate completo
**Depende de:** T15.
**Toca:**
- `progress/impl_QC-70-errores-centralizados.md`

**Hecho cuando:** el mapa `R1..R33 -> test` está escrito y **cada requisito tiene al menos un
test nombrado**; `./init.sh` **completo** en verde; `package.json` sin una sola línea de
diferencia; `git diff --stat db/` y `git diff --stat lib/modules/identity/` **vacíos** (R25); y el
progreso deja anotados, para el leader, los dos literales de `unidades` que QC-39 tendrá que
actualizar. `requirements.md` no tiene ninguna pregunta abierta: las tres se cerraron
(2026-09-07 la 1, 2026-09-08 la 2 y la 3).
