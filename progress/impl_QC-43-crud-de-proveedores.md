# QC-43 — crud-de-proveedores · bitácora de implementación

> Rama `feature/QC-43-crud-de-proveedores`, worktree
> `.worktrees/QC-43-crud-de-proveedores`, base de datos propia `QuimiCloude_QC43`.
> Spec aprobado por el humano el 2026-09-03 (F1.4), con **P2 cerrada: variante B**.

## Tanda 1 — T0 a T6 (Grupo A + los dos esquemas del Grupo B)

Alcance de esta tanda: **T1, T2, T3, T4, T5 y T6**. T7 y posteriores **no se empezaron**.

### T0 — Qué se hereda montado y NO se re-crea

Verificado contra el árbol de la rama, no contra el documento:

| Se hereda | Estado comprobado |
| --- | --- |
| `Supplier` y `SupplierCatalogLine` en `db/schema.prisma` | Presentes. `Supplier` **no se toca**; `SupplierCatalogLine` gana solo las dos columnas de autor del cambio 3 |
| `db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/` | Presente con `migration.sql` y `down.sql`. **No se modifica** |
| `lib/modules/proveedores/domain/supplier-name.ts` + su test | Presentes. `normalizeSupplierName` se **consume** desde `supplier-input.ts`; no se reescribe ni se factoriza |
| `lib/shared/pagination.ts` (`DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`) + `tests/unit/pagination.test.ts` | Presentes. No se tocan; `scope.test.ts` vigila que el módulo no los reimplemente |
| Contrato de `inventario` (`ProductCatalog`, `ProductId`, `ProductRef`, `findProductRefs`) | Presente. Esta tanda todavía no lo consume (es T9) |
| `ROLE_ADMINISTRADOR` exportado por `@/lib/modules/identity` | Presente (`index.ts` línea 17). `domain/actor.ts` lo importa **del barrel**. No se declara constante propia y **no se tocan** las copias de `inventario` ni de `recetas` |
| `identity.getSessionUser()` cableado en `lib/composition` | Presente. Esta tanda no escribe ningún lector de sesión |
| Las tres guardias + `tests/unit/proveedores/module-contract.test.ts` | Presentes y en verde. **Ninguna se relajó** |
| `ports/.gitkeep`, `adapters/driven/.gitkeep`, `adapters/driving/.gitkeep` | Los tres siguen ahí: esta tanda no puso ningún archivo real en esas carpetas (es T7, T11, T12, T14). `scope.test.ts` vigila que se borren cuando llegue el primero |

### Archivos creados

| Archivo | Qué es |
| --- | --- |
| `lib/modules/proveedores/domain/actor.ts` | `Actor` y `requireAdmin`, con `ROLE_ADMINISTRADOR` del barrel de `identity` (T1) |
| `lib/modules/proveedores/domain/errors.ts` | `ProveedoresError` y sus seis clases con `code` estable (T1) |
| `lib/modules/proveedores/domain/page.ts` | `Page<T>`, `PageQuery`, `pageQuerySchema` (T1) |
| `lib/modules/proveedores/domain/supplier-input.ts` | `createSupplierSchema` / `updateSupplierSchema`, `blankToNull`, los tres largos máximos (T5) |
| `lib/modules/proveedores/domain/catalog-line-input.ts` | `createCatalogLineSchema` / `updateCatalogLineSchema` (T6) |
| `db/migrations/20260903200343_supplier_contact_cost_and_line_audit/migration.sql` | UP de los tres cambios (T3) |
| `db/migrations/20260903200343_supplier_contact_cost_and_line_audit/down.sql` | DOWN que **revierte** al esquema exacto de QC-42 (T3) |
| `tests/unit/proveedores/scope.test.ts` | Test de alcance adelantado (T2) |
| `tests/unit/proveedores/supplier-input.test.ts` | R9, R10, R11, R13, R20, R41 (T5) |
| `tests/unit/proveedores/catalog-line-input.test.ts` | R28, R30, R33, R41 (T6) |

### Archivos modificados

| Archivo | Qué cambia y por qué |
| --- | --- |
| `db/schema.prisma` | `SupplierCatalogLine` gana `createdBy`/`updatedBy` y sus dos `@@index`, y sus comentarios `///` dejan de decir que la línea no tiene autor. **Ningún otro modelo se toca** (T3) |
| `tests/unit/proveedores/schema/proveedores-migration.test.ts` | Se **amplía** con el bloque de QC-43 (8 casos nuevos). Nada del bloque de QC-42 se toca salvo añadir `positive` al vocabulario inglés (T4) |
| `tests/unit/proveedores/schema/proveedores-schema.test.ts` | **Desviación necesaria**, ver abajo (T3) |
| `specs/QC-43-crud-de-proveedores/tasks.md` | T1–T6 marcadas `[x]` |

### El `CHECK` de contacto, tal como quedó escrito

```sql
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_contact_required";

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_contact_required"
  CHECK ("deleted_at" IS NOT NULL
         OR COALESCE(btrim("phone"), '') <> ''
         OR COALESCE(btrim("email"), '') <> '');
```

Tres cosas deliberadas: el **`COALESCE`** (sin él, `btrim(NULL) <> ''` evalúa a `NULL` y un
`CHECK` que evalúa a `NULL` **se cumple**, con lo que la restricción dejaría pasar justo la fila
que existe para bloquear); el **`deleted_at IS NOT NULL OR`** (variante B, P2 cerrada por el
humano: un proveedor dado de baja sí puede quedarse sin contacto); y el **nombre sin cambiar**, que
es la misma regla con distinta definición.

### Mapa `R<n> → test`, con la mutación que puso rojo a cada uno

Solo los requisitos que T1–T6 dicen cubrir. Cada mutación se aplicó de verdad, se vio el rojo y se
revirtió.

| R | Test | Mutación que lo puso en rojo |
| --- | --- | --- |
| R9 | `supplier-input.test.ts > rechaza el nombre vacio, el de solo espacios y el que queda vacio al normalizarlo, y recorta los extremos` | Quitar `.refine(normalizeSupplierName(name) !== '')` de `supplierNameSchema`; y aparte, `name: supplierNameSchema` → `z.any()` |
| R10 | `supplier-input.test.ts > rechaza el nombre de mas de 120, el telefono de mas de 40 y el correo de mas de 160` | `SUPPLIER_NAME_MAX_LENGTH = 120` → `999` |
| R11 | `supplier-input.test.ts > rechaza el proveedor cuyo telefono y correo llegan los dos ausentes, vacios o en blanco` | Evaluar el `refine` de contacto sobre el crudo (`!== undefined` en vez de `!== null`, que es lo que ocurriría si `blankToNull` no corriera antes) |
| R13 | `supplier-input.test.ts > recorta los extremos del telefono y del correo y convierte en ausencia el que llega en blanco` | `blankToNull` devuelve el valor tal cual, sin recortar ni anular |
| R20 | `supplier-input.test.ts > rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1, sin leer del repositorio` | `pageQuerySchema.page`: `z.number().int().min(1)` → `z.number().min(0)` |
| R41 | `supplier-input.test.ts` + `catalog-line-input.test.ts > rechaza la entrada que no cumple el esquema antes de llamar al caso de uso` | `name: supplierNameSchema` → `z.any()`; y `supplierId`/`productId` → `z.any()` en el alta de la línea |
| R28 | `catalog-line-input.test.ts > rechaza el costo cero y el costo negativo antes de llegar al repositorio` | Quitar el `refine` de `> 0` (deja la regla `>= 0` de QC-42) |
| R30 | `catalog-line-input.test.ts > rechaza el minimo de compra y el tiempo de entrega negativos, y admite la linea sin ninguno de los dos` | `minPurchase` sin `regex(DECIMAL_PATTERN)` y `deliveryTime` sin `.int().min(0)` |
| R33 | `catalog-line-input.test.ts > el esquema de edicion rechaza un productId o un supplierId de mas` | `updateCatalogLineSchema`: `z.strictObject` → `z.object` (pasa a ignorar el campo de más en silencio) |
| R38 | `proveedores-migration.test.ts > la migracion solo contiene los tres cambios y no toca ninguna otra tabla` + `scope.test.ts > esta feature no anade ninguna columna, indice ni restriccion fuera de los tres cambios` | Añadir `ALTER TABLE "products" DROP CONSTRAINT ...` al UP real; añadir la columna `notes` a `SupplierCatalogLine`; crear una tercera migración que toca `suppliers` |
| R39 | `proveedores-migration.test.ts > el down.sql recrea las dos restricciones de QC-42 con su definicion literal y borra las dos columnas de autor` (+ su caso de sensibilidad) | Dejar el `down.sql` real **solo con `DROP`**, sin los dos `ADD CONSTRAINT` |
| R40 | `proveedores-migration.test.ts > toda columna, indice y restriccion nueva esta en ingles y en snake_case` | Cubierto por el censo exacto de identificadores creados: cualquier renombre rompe la igualdad (y el predicado `isEnglishSnakeCase` tiene su propio caso de sensibilidad heredado de QC-42) |
| R42 | `scope.test.ts > no hay ningun route handler de proveedores bajo app/api` | Crear `app/api/proveedores/route.ts` |
| R45 | `scope.test.ts > el modulo proveedores no reimplementa el calculo de paginacion` | Copiar `(page - 1) * pageSize` dentro de `lib/modules/proveedores/` |
| R47 | `scope.test.ts > no existe ninguna pantalla, pagina ni componente de proveedores, ni spec E2E nuevo` | Crear `app/(private)/proveedores/page.tsx`; y aparte, `e2e/proveedores.spec.ts` |

Los tres cambios de base tienen además, **en el mismo test estático**, su caso de sensibilidad
sobre el SQL real: quitar el `COALESCE` (rojo), `>` → `>=` (rojo) y `RESTRICT` → `SET NULL` (rojo).
La demostración de que **la base** los rechaza en ejecución es de T17 y T18, que no son de esta
tanda.

### Desviaciones

1. **`tests/unit/proveedores/schema/proveedores-schema.test.ts` (de QC-42) se modificó.** Su caso
   `SupplierCatalogLine no declara createdBy ni updatedBy` afirmaba en positivo la ausencia que el
   **cambio 3 de esta ficha deroga** (decisión cerrada 3 de QC-43, que se aparta expresamente de la
   14 de QC-42). Pasa a afirmar la **presencia** con la misma exigencia: escalares uuid anulables,
   sin `@relation`, sin `@default`, con sus dos índices. También se actualizaron el censo de
   columnas de la línea, la lista de escalares que cruzan de módulo y la lista de índices. **No se
   relajó nada**: el test sigue cayendo si alguien añade un `@relation` o una columna de más.
2. **`prisma migrate dev --create-only` generó diez `DROP CONSTRAINT` de drift** sobre `products`,
   `recipes`, `recipe_lines`, `suppliers` y `supplier_catalog_lines` — todas las FK que cruzan de
   módulo del repo, precisamente porque son escalares sin `@relation` en el esquema. **Se borraron
   a mano** antes de escribir nada más: aplicarlas habría destruido en silencio la integridad
   referencial de tres features ya mergeadas. Queda anotado en la cabecera del `migration.sql` y
   vigilado por el test estático (`dropsAjenos`).
3. **La migración NO se aplicó a la base.** Aplicarla y probar el ciclo
   `db:migrate` → `db:rollback` → `db:migrate` es **T16**, que no es de esta tanda. La base
   `QuimiCloude_QC43` sigue en el estado de QC-42 y la carpeta de migración está pendiente de
   aplicar.

### Salida real de la verificación

```
$ pnpm typecheck        # tsc --noEmit
(sin salida: limpio)

$ pnpm lint             # eslint
(sin salida: limpio)

$ pnpm exec vitest related --run lib/modules/proveedores/domain/{actor,errors,page,supplier-input,catalog-line-input}.ts db/schema.prisma
 Test Files  2 passed (2)
      Tests  11 passed (11)

$ pnpm exec vitest run tests/unit/proveedores guard
 Test Files  19 passed (19)
      Tests  204 passed (204)
   Duration  1.42s
```

No se corrió la suite completa ni `./init.sh`: es del leader (regla del arnés sobre corridas
largas en subagente).

### Veredicto

T1–T6 cerradas y verificadas por mutación; los tres cambios de esquema escritos con su `down.sql`
que **revierte** —no solo deshace—, y el `CHECK` de contacto con su `COALESCE` y su exención de
las filas dadas de baja tal como el humano cerró P2.

---

## Tanda 2 — T7 a T12 (resto del Grupo B + los dos adaptadores driven)

Alcance de esta tanda: **T7, T8, T9, T10, T11 y T12**. T13 y posteriores **no se
empezaron**: el cableado puerto→implementación es T13, las Server Actions T14, y el ciclo
real de la migración T16.

### Archivos creados

| Archivo | Qué es |
| --- | --- |
| `lib/modules/proveedores/domain/supplier-view.ts` | `NewSupplier` (con `nameNormalized`) y `SupplierView`, sin `deletedAt` (T7) |
| `lib/modules/proveedores/domain/catalog-line-view.ts` | `CatalogLineTerms`, `NewCatalogLine`, `CatalogLineView` con `productName: string \| null` (T7) |
| `lib/modules/proveedores/ports/supplier-repository.ts` | Los cinco métodos `…Alive`, sin búsqueda por nombre (T7) |
| `lib/modules/proveedores/ports/supplier-catalog-repository.ts` | Los cuatro métodos, sin búsqueda por pareja (T7) |
| `lib/modules/proveedores/domain/{create,update,delete,get}-supplier.ts`, `list-suppliers.ts` | Los cinco casos de uso del proveedor (T8) |
| `lib/modules/proveedores/domain/{create,update,delete}-catalog-line.ts`, `list-catalog-lines.ts` | Los cuatro del catálogo (T9) |
| `lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts` | Implementación Prisma de `SupplierRepository` (T11) |
| `lib/modules/proveedores/adapters/driven/persistence/supplier-catalog-line-prisma.ts` | Implementación Prisma de `SupplierCatalogRepository` (T12) |
| `tests/unit/proveedores/supplier-service.test.ts` | 7 casos con dobles del puerto (T8) |
| `tests/unit/proveedores/catalog-service.test.ts` | 6 casos con dobles del repositorio y del contrato de `inventario` (T9) |
| `tests/unit/proveedores/authorization.test.ts` | 5 casos: los nueve por siete actores no autorizados (T10) |

### Archivos modificados

| Archivo | Qué cambia y por qué |
| --- | --- |
| `tests/unit/proveedores/module-contract.test.ts` | El caso `la feature no anade adaptadores driving, rutas ni Server Actions` afirmaba `ports/` y `adapters/driven/` **vacías** —R35 de QC-42, la ficha de esquema, que T7/T11/T12 derogan expresamente—. Pasa de «vacías» a «exactamente estos cuatro archivos», y añade que sus `.gitkeep` ya **no** están. Y el caso del ORM pasa de prohibir `@prisma/client` en TODO el módulo a permitirlo en una **lista blanca exacta** de dos archivos. `adapters/driving/` sigue afirmada como vacía: es T14 |
| `lib/modules/proveedores/ports/.gitkeep`, `adapters/driven/.gitkeep` | Borrados (T7, T11/T12) |
| `specs/QC-43-crud-de-proveedores/tasks.md` | T7–T12 marcadas `[x]` |

### Mapa `R<n> → test`, con la mutación que puso rojo a cada uno

Solo los requisitos que T7–T12 dicen cubrir. Cada mutación se aplicó de verdad, se vio el
rojo y se revirtió.

| R | Test | Mutación que lo puso en rojo |
| --- | --- | --- |
| R1 | `authorization.test.ts > cada caso de uso recibe el actor por parametro y no lee ninguna sesion` | Quitar `requireAdmin` de cualquiera de los nueve (3 tests rojos cada uno); y moverlo **después** de la llamada al puerto en `get-supplier.ts` |
| R2 | `authorization.test.ts > un actor con rol Operador es rechazado en los nueve casos de uso sin llamar a ningun puerto` | Ídem: se probaron **los nueve, uno a uno** (`requireAdmin(actor)` → `void actor;`), y los nueve pusieron en rojo 3 tests |
| R3 | `authorization.test.ts > un actor ausente, con rol nulo, vacio o desconocido se rechaza igual que el Operador` | Ídem los nueve; el caso cubre `null`, `undefined`, rol nulo, vacío, desconocido, «Administrador**es externos**» y el mismo rol en minúsculas |
| R4 | `authorization.test.ts > el rol autorizado sale de ROLE_ADMINISTRADOR de identity y ningun archivo del modulo incrusta el literal` | Sustituir el import del barrel por una constante propia con el literal en `actor.ts` |
| R7 | `supplier-service.test.ts > persiste el nombre normalizado junto al nombre en el alta y en la edicion` (camino feliz; la prueba contra Postgres es T17) | Quitar `nameNormalized` del objeto que va al puerto |
| R8 | `supplier-service.test.ts > guarda al actor como autor de creacion y de modificacion al crear, y solo de modificacion al editar y al dar de baja` | Pasar otro identificador en vez de `actor.id` a `updateAlive` |
| R13 | `supplier-service.test.ts > la edicion reemplaza nombre, telefono y correo y no expone ninguna operacion por campo suelto` | `blankToNull` devuelve el valor tal cual, sin recortar ni anular |
| R14 | ídem | La misma mutación de arriba, más: añadir `restoreDeleted` al puerto (cae la lista exacta de métodos) |
| R15 | `supplier-service.test.ts > traduce el duplicado del puerto a error de nombre repetido sin crear ni modificar nada` | Neutralizar la condición del duplicado en `create-supplier.ts` |
| R16 | `supplier-service.test.ts > persiste el nombre normalizado junto al nombre en el alta y en la edicion` | Pasar el dato validado sin `nameNormalized` al puerto |
| R22 | `supplier-service.test.ts > no existe ninguna operacion de restaurar ni de listar dados de baja` | Añadir `restoreDeleted(id)` al puerto |
| R24 | `supplier-service.test.ts > devuelve no encontrado al consultar, editar o dar de baja un proveedor inexistente o ya dado de baja` | Comparar contra `undefined` en vez de `null` en `get-supplier.ts` |
| R25 | `catalog-service.test.ts > traduce el duplicado del puerto a error de linea repetida` (el camino feliz vive en el caso de R26; la prueba contra Postgres es T18) | Quitar la traducción de `supplier_not_found` a `NotFoundError` |
| R26 | `catalog-service.test.ts > rechaza la linea cuyo producto no existe o esta dado de baja, preguntando al contrato de inventario` | Neutralizar el `if` que exige que el producto vuelva de `findRefs`; y aparte, mover `findRefs` dentro del `map` de líneas (cae `toHaveBeenCalledTimes(1)`) |
| R27 | `catalog-service.test.ts > traduce el duplicado del puerto a error de linea repetida` | Quitar la línea que traduce el duplicado a `DuplicateCatalogLineError` |
| R30 | `catalog-service.test.ts > la edicion cambia solo costo, minimo y plazo` (segunda mitad) | Pasar el dato crudo: `minPurchase` llega `undefined` en vez de `null` |
| R31 | `catalog-service.test.ts > guarda al actor como autor de creacion y de modificacion de la linea, y al editarla no toca ningun dato del proveedor` | Añadir un repositorio de proveedores a `UpdateCatalogLineDeps` |
| R33 | `catalog-service.test.ts > la edicion cambia solo costo, minimo y plazo` | Colar un `productId` en el objeto que va a `updateTerms` |
| R34 | ídem (tercera mitad: `deleteById` y la lista exacta de métodos del puerto) | Añadir un método de más al puerto del catálogo |
| R35 | `supplier-service.test.ts > ni la ficha ni el listado de proveedores traen las lineas del catalogo` + `catalog-service.test.ts > el catalogo se consulta con su propio listado paginado y ordenado` | Añadir el catálogo a `GetSupplierDeps`; y una llamada a `findRefs` por línea |
| R36 | `catalog-service.test.ts > el listado no devuelve nada de un proveedor dado de baja y no pregunta por sus productos` | Hacer que el dominio ignore `supplier_not_found` y devuelva página vacía. **La otra mitad —que el ADAPTADOR compruebe de verdad que el proveedor está vivo— solo la puede morder T18**: ver «Lo que esta tanda NO puede demostrar» |
| R37 | `catalog-service.test.ts > el catalogo se consulta con su propio listado paginado y ordenado` | Filtrar de la página las líneas cuyo producto no volvió de `findRefs` |
| R44 | `module-contract.test.ts` (ampliado) + guardia de arquitectura | Añadir un **tercer** archivo del módulo que importe el cliente del ORM (cae la lista blanca); y hacer que el adaptador del catálogo consulte el modelo de productos (cae el bloque 10 de la guardia) |

### El test de autorización de los nueve casos de uso (T10)

`tests/unit/proveedores/authorization.test.ts`. Los **tres** puertos —repositorio de
proveedores, repositorio del catálogo y `ProductCatalog`— son dobles cuyos métodos
**lanzan si los llaman**, y cada caso afirma `not.toHaveBeenCalled()` sobre los once
espías. Cinco casos:

1. **Los nueve están en la tabla**: la lista de factories se lee del **disco**
   (`readdirSync` de `domain/`), así que un décimo caso de uso que nadie añada pone el test
   en rojo. Sin esto, «los nueve» sería una promesa del comentario de cabecera.
2. **Rol `Operador`** en los nueve, con entrada **válida** —si fuera basura, un
   `ValidationError` podría estar tapando la falta de `requireAdmin`—.
3. **Falla cerrado** en los nueve por siete actores: `null`, `undefined`, rol nulo, vacío,
   desconocido, un rol que *contiene* el autorizado y el autorizado en minúsculas.
4. **El actor es argumento**: ningún archivo de `domain/` nombra sesión, cookie, cabecera
   ni `@/lib/composition` —con los comentarios retirados del texto, para no medir
   comentarios—; y con el rol autorizado el caso de uso **sí** llega al puerto, lo que
   impide que el test pase por un `throw` incondicional.
5. **R4**: ningún archivo del módulo contiene el literal del rol, y `actor.ts` lo importa
   del **barrel** de `identity`.

### Lo que esta tanda NO puede demostrar (y quién lo demuestra)

- **La mitad de R8 y de R31 que vive en el adaptador** —que al editar no se pisa el autor
  de creación— no la puede morder un doble: el dato que el dominio manda no lleva ese campo
  (eso **sí** está afirmado), pero que el `updateMany` no lo escriba solo lo prueba
  Postgres. **T17 y T18.**
- **La comprobación de proveedor vivo de `listBySupplierAlive`** (R36) está escrita en
  `supplier-catalog-line-prisma.ts` y **ningún test de esta tanda la muerde**: quitarla
  deja todo verde. Su única prueba real es **T18**, que es donde `tasks.md` la pone.
- **R12, R29 y R32** (las tres reglas nuevas de base) son T17/T18 por definición: aquí
  `zod` llega antes, y un test que se quedara verde quitando el `CHECK` no contaría.

### Una observación para el reviewer (no es un cambio)

`createCatalogLine` acepta una línea para un proveedor **dado de baja**: la FK se satisface
porque la fila sigue existiendo, y ni `requirements.md` ni `design.md > 7` piden
rechazarlo —el puerto solo distingue `supplier_not_found`, que es el `23503` del proveedor
**inexistente**—. No se ha inventado la regla (regla 6 de `CLAUDE.md`). El efecto práctico
es acotado: R36 hace que esa línea **no aparezca** en ningún listado mientras el proveedor
siga de baja. Si el humano quiere que el alta también se rechace, es un cambio de
`design.md > 7` y del puerto, no un `if` en el caso de uso.

### Salida real de la verificación

```
$ pnpm typecheck        # tsc --noEmit
(sin salida: limpio)

$ pnpm lint             # eslint
(sin salida: limpio)

$ pnpm exec vitest related --run lib/modules/proveedores/domain/create-supplier.ts \
    lib/modules/proveedores/domain/list-catalog-lines.ts \
    lib/modules/proveedores/adapters/driven/persistence/supplier-prisma.ts \
    lib/modules/proveedores/ports/supplier-repository.ts
 Test Files  3 passed (3)
      Tests  18 passed (18)

$ pnpm exec vitest run tests/unit/proveedores guard
 Test Files  22 passed (22)
      Tests  222 passed (222)
   Duration  1.66s
```

No se corrió la suite completa ni `./init.sh`: es del leader.

### Veredicto

T7–T12 cerradas: los dos puertos sin ningún método de búsqueda —la comprobación previa a un
índice único ni siquiera es expresable—, los nueve casos de uso con `requireAdmin` en la
primera línea de los nueve (verificado quitándolo **uno a uno**) y los dos adaptadores
driven como únicos archivos del módulo que hablan con el ORM.

---

## Tanda 3 — T13 a T16 (cableado, Server Actions, contrato contra `dmmf` y ciclo real de la migración)

Alcance de esta tanda: **T13, T14, T15 y T16**. T17 y posteriores **no se empezaron**: los dos
archivos de integración, el cierre de alcance y el cierre de la feature siguen abiertos.

### Archivos creados

| Archivo | Qué es |
| --- | --- |
| `lib/modules/proveedores/adapters/driving/supplier-actions.ts` | Las cinco Server Actions del proveedor (T14) |
| `lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts` | Las cuatro Server Actions del catálogo (T14) |
| `tests/unit/proveedores/supplier-actions.test.ts` | R5, R42, R43 con los nombres exactos de la tabla de trazabilidad (T14) |

### Archivos modificados

| Archivo | Qué cambia y por qué |
| --- | --- |
| `lib/modules/proveedores/index.ts` | El contrato pasa de exportar solo `normalizeSupplierName` a exportar tipos, esquemas, errores y las nueve factories. **Todo sigue saliendo de `./domain`**: ni un adaptador, ni un puerto (T13) |
| `lib/composition/index.ts` | Bloque **nuevo al final** con los dos repositorios y la fachada `proveedores`; sus imports, al final del bloque de imports. **`productCatalog` se reutiliza**, no se construye una segunda vez. Nada de lo anterior se reordena ni se reformatea (T13) |
| `tests/unit/proveedores/module-contract.test.ts` | Tres cambios, los tres **derogaciones expresas** de afirmaciones de QC-42 que T13/T14 invalidan, más el caso nuevo de T15. Detalle abajo |
| `lib/modules/proveedores/adapters/driving/.gitkeep` | Borrado: la carpeta ya tiene archivos reales (T14) |
| `specs/QC-43-crud-de-proveedores/tasks.md` | T13–T16 marcadas `[x]` |

### Qué cambió en `module-contract.test.ts`, y por qué no es relajar nada

1. **`lib/composition` ya no está prohibido**: QC-42 afirmaba que la ficha de esquema no lo tocaba.
   La afirmación se **invierte**, no se borra: caso nuevo `el cableado puerto-implementacion de
   proveedores vive SOLO en lib/composition y una sola vez`, que exige la fachada exactamente una
   vez, con las **nueve claves exactas**, `productCatalog` construido una sola vez, y **nadie fuera
   de la composición** importando `adapters/` ni `ports/` de `proveedores`.
2. **`adapters/driving/` pasa de «vacía» a «exactamente estos dos archivos»**, y `'use server'`
   pasa de prohibido en todo el módulo a **obligatorio en la primera línea de los dos driving y
   prohibido en el resto**. Un tercer archivo, o una directiva colada en `domain/`, sigue cayendo.
3. **La prohibición de importar `@/lib/composition`** se acota a `domain/`, `ports/` y
   `adapters/driven/` —la flecha va driving → composición → driven—, y se añade la afirmación
   **positiva** de que los dos driving **sí** la consumen.

### T16 — el ciclo real de la migración, contra `QuimiCloude_QC43`

**Base comprobada antes de tocar nada**, no asumida: `DATABASE_URL` y `DIRECT_URL` del `.env` del
worktree apuntan a `localhost:5432/QuimiCloude_QC43`, y la propia conexión lo confirma
(`SELECT current_database()` → `QuimiCloude_QC43`). La base compartida `QuimiCloude` **no se tocó**.

El estado se comparó **contra la base**, no leyendo el SQL: un censo de `information_schema.columns`,
`pg_constraint` con `pg_get_constraintdef`, `pg_indexes`, `pg_class.relrowsecurity/relforcerowsecurity`
y `_prisma_migrations`, tomado en tres momentos.

```
$ pnpm run db:migrate      # prisma migrate deploy
Datasource "db": PostgreSQL database "QuimiCloude_QC43", schema "public" at "localhost:5432"
Applying migration `20260903200343_supplier_contact_cost_and_line_audit`
All migrations have been successfully applied.

$ pnpm run db:rollback
db:rollback: aplicando down.sql de 20260903200343_supplier_contact_cost_and_line_audit
            y borrando su fila de _prisma_migrations
db:rollback: 20260903200343_supplier_contact_cost_and_line_audit revertida.

$ pnpm run db:migrate
Applying migration `20260903200343_supplier_contact_cost_and_line_audit`
All migrations have been successfully applied.
```

**Lo que el UP cambió, y solo eso** (diff del censo antes → después):

```
+ supplier_catalog_lines.created_by uuid nullable=YES
+ supplier_catalog_lines.updated_by uuid nullable=YES
+ supplier_catalog_lines_created_by_fkey  FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
+ supplier_catalog_lines_updated_by_fkey  FOREIGN KEY (updated_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
+ supplier_catalog_lines_created_by_idx / _updated_by_idx
- supplier_catalog_lines_cost_non_negative  CHECK (cost >= 0)
+ supplier_catalog_lines_cost_positive      CHECK (cost > 0)
- suppliers_contact_required  CHECK ((phone IS NOT NULL) OR (email IS NOT NULL))
+ suppliers_contact_required  CHECK ((deleted_at IS NOT NULL) OR (COALESCE(btrim(phone), '') <> '') OR (COALESCE(btrim(email), '') <> ''))
+ _prisma_migrations: 20260903200343_... terminada=true
```

Ni una tabla ajena tocada, ni un `DROP` de drift: los diez que `migrate dev --create-only` había
generado y que la tanda 1 borró a mano **no reaparecieron** (habrían salido en este diff como FK
desaparecidas de `products`, `recipes`, `recipe_lines`, `suppliers` y `supplier_catalog_lines`).

**Y lo que el rollback dejó: el censo posterior al `down.sql` es IDÉNTICO al de antes de aplicar la
migración** —`diff` sin una sola línea de diferencia—. Es decir:

- `suppliers_contact_required` de vuelta **con su definición literal de QC-42**
  (`(phone IS NOT NULL) OR (email IS NOT NULL)`), no ausente;
- `supplier_catalog_lines_cost_non_negative` de vuelta con `CHECK (cost >= 0)`, y
  `..._cost_positive` fuera;
- `created_by`/`updated_by`, sus dos FK y sus dos índices, fuera;
- `relrowsecurity` y `relforcerowsecurity` en `true` en las dos tablas durante todo el ciclo (R6);
- `_prisma_migrations` coherente: la fila desaparece con el rollback y vuelve con el segundo
  `deploy`.

El segundo `db:migrate` deja un censo **idéntico** al del primero, así que el ciclo es reproducible.
**El `down.sql` revierte, no solo deshace** (R39), y esta vez está comprobado contra Postgres y no
leyendo el archivo. **Ningún hallazgo**: no hizo falta corregir el `down.sql`.

La base queda **con la migración aplicada**, que es lo que T17 y T18 necesitan.

### Mapa `R<n> → test`, con la mutación que puso rojo a cada uno

Solo los requisitos que T13–T16 dicen cubrir. Cada mutación se aplicó de verdad, se vio el rojo y se
revirtió.

| R | Test | Mutación que lo puso en rojo |
| --- | --- | --- |
| R5 | `supplier-actions.test.ts > la accion toma el actor de identity.getSessionUser y no vuelve a comprobar el rol` | Sustituir `await identity.getSessionUser()` por un actor inventado en la propia action (cae el conteo de llamadas y el actor esperado); y aparte, **añadir `requireAdmin(actor)` dentro de la action** (cae por el barrido de fuente: la action volvería a decidir) |
| R42 | `supplier-actions.test.ts > las mutaciones reciben FormData y las consultas argumentos tipados` + `scope.test.ts > no hay ningun route handler de proveedores bajo app/api` (ya existente) | Cuatro mutaciones, cuatro rojos: (1) el alta ignora el `FormData` y fija `name: 'Acme'`; (2) `getSupplierAction` pasa a recibir `FormData` en vez de un `id` tipado; (3) se quita el rechazo del `deliveryTime` no entero, que dejaría colarse `NaN`; (4) se quita el corte por `id` ausente de `deleteCatalogLineAction` |
| R43 | `supplier-actions.test.ts > traduce cada error de dominio a status error con el code estable de la clase, nunca con el texto` | `code: error.code` → `code: error.name` (el `code` pasaría a salir del nombre de la clase); y aparte, que `toErrorState` **se trague** el error ajeno devolviendo `invalid_input` en vez de relanzarlo |
| R44 | `module-contract.test.ts > el cableado puerto-implementacion de proveedores vive SOLO en lib/composition y una sola vez` + `> el catalogo no gana ninguna relacion Prisma hacia Product ni hacia User` + las guardias ya existentes | Quitar `getSupplier` de la fachada (cae la lista exacta de nueve claves); construir un **segundo** `productCatalog`; reexportar un adaptador driven desde el contrato (`export { createSupplier } from './adapters/…'`); y, contra el `dmmf`, declarar `creator User? @relation(fields: [createdBy], …)` en `SupplierCatalogLine` con su reverso en `User` y **regenerar el cliente** (rojo en tres casos) |
| R39 | `proveedores-migration.test.ts > el down.sql recrea las dos restricciones de QC-42 con su definicion literal y borra las dos columnas de autor` (ya existente, tanda 1) + **T16**, el ciclo real | La prueba de esta tanda no es una mutación de código sino la **ejecución**: el censo post-rollback contra Postgres es idéntico al pre-migración. Un `down.sql` que solo dropeara habría dejado las dos tablas sin ninguna regla de contacto ni de costo y el `diff` lo habría cantado |

La afirmación de R44 sobre las columnas de autor tiene además su propia mutación de esquema:
**quitar `createdBy`/`updatedBy` de `SupplierCatalogLine`** y regenerar el cliente pone en rojo el
caso de T15 (afirma que existen **y** que son escalares anulables: las dos mitades importan).

### Lo que esta tanda NO puede demostrar (y quién lo demuestra)

- Que la base **rechace de verdad** el contacto en blanco (R12), el costo cero (R29) y el autor
  inexistente (R32). El ciclo de T16 demuestra que las tres reglas **están instaladas** con su
  definición exacta; que Postgres las haga cumplir con su SQLSTATE es **T17 y T18**.
- La mitad de R8 y de R31 que vive en el adaptador —que al editar no se pise el autor de creación—
  sigue esperando a T17/T18, tal como anotó la tanda 2.
- Las Server Actions se prueban contra dobles de `@/lib/composition`: que la fachada **real** esté
  bien atada lo afirma el caso de contrato de T13 (estructuralmente), y lo ejerce de punta a punta
  QC-44.

### Salida real de la verificación

```
$ pnpm typecheck        # tsc --noEmit
(sin salida: limpio)

$ pnpm lint             # eslint
(sin salida: limpio)

$ pnpm exec vitest related --run lib/modules/proveedores/index.ts lib/composition/index.ts \
    lib/modules/proveedores/adapters/driving/supplier-actions.ts \
    lib/modules/proveedores/adapters/driving/supplier-catalog-actions.ts db/schema.prisma
 Test Files  24 passed (24)
      Tests  245 passed (245)

$ pnpm exec vitest run tests/unit/proveedores guard
 Test Files  23 passed (23)
      Tests  226 passed (226)
```

No se corrió la suite completa ni `./init.sh`: es del leader.

### Veredicto

T13–T16 cerradas: la fachada cableada en el único sitio donde puede estarlo, las nueve Server
Actions que traducen y no deciden, el cruce por ORM vigilado contra el `dmmf` con las dos columnas
de autor ya en el esquema, y el ciclo `migrate → rollback → migrate` ejecutado contra
`QuimiCloude_QC43` con el estado post-rollback **idéntico** al previo, comprobado contra la base.
