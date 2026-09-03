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
