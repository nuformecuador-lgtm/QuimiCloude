# QC-43 — crud-de-proveedores · tasks.md

> Zona: `backend` · Complejidad: `high` · Rama: `feature/QC-43-crud-de-proveedores`
>
> El **qué** está en `requirements.md` (R1–R47); el **cómo**, en `design.md`. Aquí está el desglose
> ejecutable. `[P]` marca lo que puede ir en paralelo con otra task del mismo grupo. Cada task
> tiene su criterio de «hecho»: si no se puede comprobar, no está hecha.
>
> **Antes de empezar:** el spec tiene que estar **aprobado** por el humano (F1.4), y esa aprobación
> tiene que **responder a P2** —si la restricción de contacto se escribe total o solo para las filas
> vivas (`design.md > 2.1`)—. **T3 no se empieza sin esa respuesta**: es la única task bloqueada por
> una pregunta abierta, y elegir por cuenta propia sería inventar (regla 6 de `CLAUDE.md`).
>
> Cierra cada tanda con `./init.sh --rapido`. **Antes del PR, `./init.sh` completo, sin excepción**
> (`docs/verification.md`): lo que esta feature acopla es SQL, nombres de archivo y forma del árbol
> de módulos, y el grafo de imports no lo ve.

---

## T0 — Qué se hereda montado y NO se re-crea

**No se escribe nada en esta task: se comprueba y se anota en
`progress/impl_QC-43-crud-de-proveedores.md`.** Existe porque la mitad de esta feature es *no*
volver a hacer lo que QC-42, QC-20 y QC-25 ya dejaron hecho.

Se hereda y **no se toca**:

- **El modelo entero.** `Supplier` y `SupplierCatalogLine` en `db/schema.prisma` y la migración
  `db/migrations/20260903131417_suppliers_and_supplier_catalog_lines/`. **Ninguna tabla nueva,
  ninguna columna fuera de las dos de autor, ningún índice fuera de los dos suyos** (R38).
- **`lib/modules/proveedores/domain/supplier-name.ts`** (`normalizeSupplierName`) y su test
  `tests/unit/proveedores/domain/supplier-name.test.ts`. La normalización **ya está resuelta**: no
  se reescribe, no se «mejora» y no se factoriza a `lib/shared/`.
- **`lib/shared/pagination.ts`** con `DEFAULT_PAGE_SIZE = 10` y `MAX_PAGE_SIZE = 25`, y su test
  `tests/unit/pagination.test.ts`. Se **consume**, no se toca ni se reimplementa (R45).
- **El contrato de `inventario`**: `ProductCatalog`, `ProductId`, `ProductRef` en
  `lib/modules/inventario/index.ts`, y su implementación `findProductRefs` en
  `adapters/driven/persistence/product-catalog-prisma.ts` (la trajo QC-25). **No se amplía el
  contrato y no se escribe una segunda implementación.**
- **`ROLE_ADMINISTRADOR`**, exportado por el barrel `@/lib/modules/identity`
  (`domain/roles.ts`). **No se declara ninguna constante de rol en `proveedores`** (R4,
  `design.md > 3`). Y **no se toca** la copia local de `inventario` ni la de `recetas`: eso es la
  ficha de arnés que `design.md > 3` propone, no esta.
- **La sesión real** (QC-8): `identity.getSessionUser()` ya cableado en `lib/composition`. No se
  escribe ningún lector de sesión.
- **Las tres guardias** (`guard-arquitectura-modulos`, `guard-rls-force`,
  `guard-dependencias-aprobadas`) y `tests/unit/proveedores/module-contract.test.ts`. Se ejecutan y
  se amplían donde toque (T15); **ninguna se relaja para que algo pase**.

Se hereda **vacío, y esta ficha lo llena**: `ports/.gitkeep`, `adapters/driven/.gitkeep` y
`adapters/driving/.gitkeep`. Los tres se **borran** al aparecer el primer archivo real de su carpeta.

**Hecho cuando:** la lista está pegada en `progress/impl_QC-43-crud-de-proveedores.md` y cada punto
verificado contra el árbol de la rama, no contra este documento.

---

## Grupo A — cimientos

- [x] **T1 [P] — Dominio base del módulo.** `domain/actor.ts` (`Actor`, `requireAdmin`, con
      `ROLE_ADMINISTRADOR` importado del **barrel** `@/lib/modules/identity`, nunca por ruta
      profunda y nunca copiando el literal), `domain/errors.ts` (`ProveedoresError` y las seis
      clases con su `code` de `design.md > 6.4`), `domain/page.ts` (`Page<T>`, `PageQuery`,
      `pageQuerySchema`).
      *Depende de:* T0. **Hecho cuando:** `pnpm run typecheck` limpio, `domain/` no importa
      framework, Prisma, `lib/shared/` ni `composition`, y `guard-arquitectura-modulos` sigue verde
      con el import del barrel de `identity`.

- [ ] **T2 [P] — Test de alcance, adelantado.** `tests/unit/proveedores/scope.test.ts`: no hay ruta,
      página ni componente de proveedores bajo `app/`, ni route handler bajo `app/api/`, ni spec
      nuevo en `e2e/`; `proveedores` no reimplementa la aritmética de paginación; ninguna columna,
      índice ni restricción fuera de los tres cambios; ningún `.gitkeep` conviviendo con archivos
      reales (R38, R42, R45, R47).
      *Depende de:* T0. **Hecho cuando:** pasa y **falla** si se añade cualquiera de esas cosas. Se
      adelanta a propósito: es mientras se llena `domain/` cuando el alcance se escapa (lección de
      QC-20 T15 y QC-25 T3).

- [ ] **T3 — La migración de los tres cambios.** `db/schema.prisma` (solo los dos campos de autor
      de `SupplierCatalogLine` y sus dos `@@index`, más los comentarios `///` que hoy dicen que la
      línea no tiene autor) y
      `db/migrations/<ts>_supplier_contact_cost_and_line_audit/{migration.sql,down.sql}` con el SQL
      literal de `design.md > 2.1`, `> 2.2`, `> 2.3`, `> 2.4` y `> 2.5`. Cabecera de aviso de drift
      como la de QC-42.
      *Depende de:* T0 **y de la respuesta humana a P2** (variante A o B del `CHECK` de contacto).
      **Hecho cuando:** `pnpm run db:migrate:create` produce la carpeta, el `down.sql` **recrea** las
      dos restricciones de QC-42 con su definición literal —no solo las dropea— y el UP no contiene
      ningún `ALTER` sobre otra tabla.

- [ ] **T4 [P] — Test estático de la migración.**
      `tests/unit/proveedores/schema/proveedores-migration.test.ts`: los tres cambios, el
      `COALESCE(btrim(...))`, el `> 0`, las dos FK a mano con su `RESTRICT`, los dos índices, los
      nombres en inglés, que `supplier_catalog_lines_cost_non_negative` **ya no existe** en el UP y
      **sí** en el DOWN, y que la migración no menciona ninguna otra tabla salvo en las FK (R38,
      R39, R40).
      *Depende de:* T3. **Hecho cuando:** pasa y **falla** al mutar el SQL: quitar el `COALESCE`,
      cambiar `>` por `>=`, cambiar un `RESTRICT` por `SET NULL`, o dejar el `down.sql` con solo
      `DROP`. Un test que no puede fallar no vigila nada.

## Grupo B — casos de uso (depende de A)

- [x] **T5 — Esquemas de entrada del proveedor.** `domain/supplier-input.ts` (`design.md > 6.1`):
      trim, mínimo 1 y máximo 120 en el nombre, `refine` del nombre que normaliza a vacío, máximos
      40/160 en teléfono y correo, `blankToNull` **antes** del `refine` de contacto, y ningún
      formato de correo ni de teléfono.
      *Depende de:* T1. **Hecho cuando:** `tests/unit/proveedores/supplier-input.test.ts` pasa (R9,
      R10, R11, R13, R20, R41) y el caso `phone: '   ', email: null` se rechaza **en el borde**, no
      en la base.

- [x] **T6 [P] — Esquemas de entrada de la línea.** `domain/catalog-line-input.ts`
      (`design.md > 6.2`): `cost` como **cadena** decimal `> 0`, `minPurchase` cadena `>= 0`
      opcional, `deliveryTime` entero `>= 0` opcional, y el esquema de edición **sin `supplierId`
      ni `productId`** (R33, posición de P5).
      *Depende de:* T1. **Hecho cuando:** `tests/unit/proveedores/catalog-line-input.test.ts` pasa
      (R28, R30, R33, R41) y el esquema de edición **rechaza** un `productId` de más en vez de
      ignorarlo en silencio.

- [ ] **T7 — Tipos de salida y los dos puertos.** `domain/supplier-view.ts`,
      `domain/catalog-line-view.ts`, `ports/supplier-repository.ts`,
      `ports/supplier-catalog-repository.ts` con los resultados discriminados de `design.md > 7`.
      **Borra `ports/.gitkeep`.**
      *Depende de:* T5, T6. **Hecho cuando:** typecheck limpio, ningún import prohibido en `ports/`
      y **ningún método de búsqueda por nombre ni por pareja** en los puertos (`design.md > 7`).

- [ ] **T8 — Los cinco casos de uso del proveedor.** `create`, `update`, `delete`, `get`, `list`.
      `requireAdmin` en la **primera línea** de cada uno, antes de `zod` y antes de tocar el puerto.
      *Depende de:* T7. **Hecho cuando:** `tests/unit/proveedores/supplier-service.test.ts` pasa con
      dobles del puerto (R7, R8, R13, R14, R15, R16, R22, R24, R35).

- [ ] **T9 — Los cuatro casos de uso del catálogo.** `create`, `update`, `delete`, `list`.
      Validación del producto **en una sola llamada** a `ProductCatalog.findRefs`
      (`design.md > 5.3`); el listado resuelve el `productName` de toda la página con otra sola
      llamada y deja `null` el del producto dado de baja.
      *Depende de:* T7. **Hecho cuando:** `tests/unit/proveedores/catalog-service.test.ts` pasa con
      dobles del repositorio y del catálogo (R25, R26, R27, R31, R33, R34, R35, R36, R37), y el
      doble del catálogo demuestra que **no se le pregunta una vez por línea**.

- [ ] **T10 — Test de autorización de los nueve casos de uso.**
      `tests/unit/proveedores/authorization.test.ts`, con dobles del repositorio de proveedores, del
      catálogo y de `ProductCatalog` que **fallan si los llaman**.
      *Depende de:* T8, T9. **Hecho cuando:** los nueve cubren Operador, rol nulo, rol vacío, rol
      desconocido y actor ausente; cada caso afirma `not.toHaveBeenCalled()` sobre los tres puertos;
      y un test afirma que **ningún archivo de `lib/modules/proveedores/**` contiene el literal
      `'Administrador'`** (R1, R2, R3, R4).

## Grupo C — adaptadores y cableado (depende de B)

- [ ] **T11 [P] — Adaptador driven de proveedores.**
      `adapters/driven/persistence/supplier-prisma.ts`: filtro `deleted_at IS NULL`, escritura de
      `created_by`/`updated_by`, `name ASC, id ASC`, uso de `toOffsetLimit`/`buildPage` de
      `lib/shared/pagination` y traducción de SQLSTATE (`23505` → `'duplicate'`).
      *Depende de:* T7. **Hecho cuando:** typecheck limpio y es uno de los dos únicos archivos del
      módulo que importan `@prisma/client`. **Borra `adapters/driven/.gitkeep`.**

- [ ] **T12 [P] — Adaptador driven del catálogo.**
      `adapters/driven/persistence/supplier-catalog-line-prisma.ts`: `listBySupplierAlive`
      comprobando que el **proveedor** está vivo antes de devolver nada (R36), conversión
      `string ↔ Prisma.Decimal`, orden `created_at ASC, id ASC`, `DELETE` físico y traducción de
      `23505` → `'duplicate'` y `23503` → `'supplier_not_found'`.
      *Depende de:* T7. **Hecho cuando:** typecheck limpio y ninguna consulta menciona
      `prisma.product` ni `prisma.user`.

- [ ] **T13 — Contrato y punto de composición.** `lib/modules/proveedores/index.ts` reexporta tipos,
      esquemas, errores y las nueve factories —**solo** de `./domain`, conservando
      `normalizeSupplierName`—; `lib/composition/index.ts` gana la fachada `proveedores` en un
      **bloque nuevo al final**, **reutilizando la constante `productCatalog` que ya existe** (línea
      192) y sin reordenar ni reformatear nada de lo que hay.
      *Depende de:* T8, T9, T11, T12. **Hecho cuando:** la guardia de módulos pasa y el contrato no
      arrastra `'use server'`, Prisma ni `next/*` en su cierre transitivo (R44).

- [ ] **T14 — Server Actions.** `adapters/driving/supplier-actions.ts` y
      `adapters/driving/supplier-catalog-actions.ts`: `'use server'`, `FormData` en crear, editar y
      dar de baja; argumentos tipados en consultar y listar; actor desde `identity.getSessionUser()`
      vía `@/lib/composition`; errores traducidos a `{ status, code, message }` por el **`code`** de
      la clase. Sin `revalidatePath` (`design.md > 9`). **Borra `adapters/driving/.gitkeep`.**
      *Depende de:* T13. **Hecho cuando:** `tests/unit/proveedores/supplier-actions.test.ts` pasa
      (R5, R42, R43), no existe ningún route handler nuevo y la acción **no** vuelve a comprobar el
      rol.

- [ ] **T15 [P] — Ampliar el contrato de módulo contra `Prisma.dmmf`.**
      `tests/unit/proveedores/module-contract.test.ts` (existe desde QC-42): afirmar que
      `SupplierCatalogLine` **sigue sin ninguna relación** hacia `Product` ni hacia `User` pese a las
      dos columnas de autor nuevas, y que `User` no gana ningún campo de vuelta.
      *Depende de:* T3. **Hecho cuando:** el test **falla** si alguien añade el `@relation` «que
      faltaba» (R26, R44). Ninguna guardia detecta ese cruce: por eso este test existe.

## Grupo D — verificación contra la base y cierre

- [ ] **T16 — Ciclo real de la migración.** `pnpm run db:migrate` → `pnpm run db:rollback` →
      `pnpm run db:migrate`, con la salida pegada en `progress/impl_QC-43-crud-de-proveedores.md`.
      *Depende de:* T3. **Hecho cuando:** el rollback deja el esquema **idéntico** al de QC-42 —las
      dos restricciones viejas presentes, las columnas de autor ausentes— y `_prisma_migrations`
      coherente (R39). El test estático solo lee texto; esto es la prueba.

- [ ] **T17 [P] — Integración: proveedor.**
      `tests/integration/proveedores/supplier-crud.int.test.ts`, con `beforeAll` que falla claro si
      la migración no está aplicada, cada caso en `$transaction` con `ROLLBACK` y afirmaciones sobre
      **SQLSTATE**. Las operaciones que deben fallar, con `$executeRaw`.
      *Depende de:* T11, T16. **Hecho cuando:** pasa contra Postgres real y cubre R7, R12, R15, R17,
      R18, R19, R21, R22, R23. **R12 es una de las tres reglas nuevas**: su caso demuestra que la
      **base** rechaza el contacto en blanco al insertar **y** al modificar, no que `zod` lo rechazó
      antes.

- [ ] **T18 [P] — Integración: catálogo.**
      `tests/integration/proveedores/catalog-line.int.test.ts`, con productos y usuarios reales
      creados dentro de la transacción.
      *Depende de:* T12, T16. **Hecho cuando:** pasa y cubre R25, R27, R29, R32, R34, R36, R37.
      **R29 y R32 son las otras dos reglas nuevas**: el costo cero se rechaza con `23514` desde la
      base al insertar y al modificar, y el autor inexistente con `23503`.

- [ ] **T19 — Cierre del alcance.** Revisar que `tests/unit/proveedores/scope.test.ts` (T2) sigue
      cubriendo sus cláusulas ahora que el módulo tiene contenido, y que ninguna guardia se relajó
      para que algo pasara.
      *Depende de:* T14, T18. **Hecho cuando:** el test falla si se añade una pantalla, un route
      handler, una columna nueva o una copia de la aritmética de paginación.

- [ ] **T20 — Cierre.** `./init.sh` completo en verde,
      `progress/impl_QC-43-crud-de-proveedores.md` con la salida real de los tests, la lista de T0 y
      el mapa `R<n> → test` de abajo, y todas las tasks marcadas `[x]`.
      *Depende de:* todas. **Hecho cuando:** `CHECKPOINTS.md` se cumple entero.

---

## Trazabilidad `R<n> → test`

Cada requisito con el archivo **y el nombre** del test que lo cierra. El reviewer rechaza si falta
uno (`CHECKPOINTS.md > Trazabilidad`). Los nombres son el contrato de esta tabla: si el implementer
los cambia, cambia también aquí.

| R | Archivo de test | Nombre del test |
| --- | --- | --- |
| R1 | `tests/unit/proveedores/authorization.test.ts` | `cada caso de uso recibe el actor por parametro y no lee ninguna sesion` |
| R2 | `tests/unit/proveedores/authorization.test.ts` | `un actor con rol Operador es rechazado en los nueve casos de uso sin llamar a ningun puerto` |
| R3 | `tests/unit/proveedores/authorization.test.ts` | `un actor ausente, con rol nulo, vacio o desconocido se rechaza igual que el Operador` |
| R4 | `tests/unit/proveedores/authorization.test.ts` | `el rol autorizado sale de ROLE_ADMINISTRADOR de identity y ningun archivo del modulo incrusta el literal` |
| R5 | `tests/unit/proveedores/supplier-actions.test.ts` | `la accion toma el actor de identity.getSessionUser y no vuelve a comprobar el rol` |
| R6 | `tests/guards/guard-rls-force.test.ts` | `toda tabla creada en las migraciones tiene ENABLE y FORCE ROW LEVEL SECURITY` (ya existente) |
| R7 | `tests/integration/proveedores/supplier-crud.int.test.ts` | `crea el proveedor con sus datos validos y devuelve su identificador` |
| R8 | `tests/unit/proveedores/supplier-service.test.ts` | `guarda al actor como autor de creacion y de modificacion al crear, y solo de modificacion al editar y al dar de baja` |
| R9 | `tests/unit/proveedores/supplier-input.test.ts` | `rechaza el nombre vacio, el de solo espacios y el que queda vacio al normalizarlo, y recorta los extremos` |
| R10 | `tests/unit/proveedores/supplier-input.test.ts` | `rechaza el nombre de mas de 120, el telefono de mas de 40 y el correo de mas de 160` |
| R11 | `tests/unit/proveedores/supplier-input.test.ts` | `rechaza el proveedor cuyo telefono y correo llegan los dos ausentes, vacios o en blanco` |
| R12 | `tests/integration/proveedores/supplier-crud.int.test.ts` | `el CHECK rechaza con SQLSTATE 23514 el proveedor vivo sin contacto util, al insertar y al modificar` |
| R13 | `tests/unit/proveedores/supplier-input.test.ts` | `recorta los extremos del telefono y del correo y convierte en ausencia el que llega en blanco` |
| R14 | `tests/unit/proveedores/supplier-service.test.ts` | `la edicion reemplaza nombre, telefono y correo y no expone ninguna operacion por campo suelto` |
| R15 | `tests/unit/proveedores/supplier-service.test.ts` + `tests/integration/proveedores/supplier-crud.int.test.ts` | `traduce el duplicado del puerto a error de nombre repetido sin crear ni modificar nada` + `el nombre de un proveedor dado de baja queda libre para otro proveedor` |
| R16 | `tests/unit/proveedores/supplier-service.test.ts` | `persiste el nombre normalizado junto al nombre en el alta y en la edicion` |
| R17 | `tests/integration/proveedores/supplier-crud.int.test.ts` | `el indice unico parcial rechaza con SQLSTATE 23505 el segundo proveedor vivo con el mismo nombre normalizado` |
| R18 | `tests/integration/proveedores/supplier-crud.int.test.ts` | `devuelve como maximo el tamano de pagina pedido y el total de proveedores` |
| R19 | `tests/integration/proveedores/supplier-crud.int.test.ts` + `tests/unit/pagination.test.ts` | `usa 10 por defecto y devuelve 25 como maximo cuando se piden 100` + `usa 10 por defecto y acota a 25` (ya existente, QC-20) |
| R20 | `tests/unit/proveedores/supplier-input.test.ts` | `rechaza un numero o un tamano de pagina que no sea entero mayor o igual a 1, sin leer del repositorio` |
| R21 | `tests/integration/proveedores/supplier-crud.int.test.ts` | `ordena por nombre ascendente y recorre las paginas sin repetir ni omitir ningun proveedor` |
| R22 | `tests/unit/proveedores/supplier-service.test.ts` + `tests/integration/proveedores/supplier-crud.int.test.ts` | `no existe ninguna operacion de restaurar ni de listar dados de baja` + `la lista y la ficha excluyen los proveedores dados de baja` |
| R23 | `tests/integration/proveedores/supplier-crud.int.test.ts` | `al dar de baja conserva la fila completa y marca deleted_at` |
| R24 | `tests/unit/proveedores/supplier-service.test.ts` | `devuelve no encontrado al consultar, editar o dar de baja un proveedor inexistente o ya dado de baja` |
| R25 | `tests/integration/proveedores/catalog-line.int.test.ts` | `crea la linea del catalogo de un proveedor vivo y devuelve su identificador` |
| R26 | `tests/unit/proveedores/catalog-service.test.ts` + `tests/guards/guard-arquitectura-modulos.test.ts` | `rechaza la linea cuyo producto no existe o esta dado de baja, preguntando al contrato de inventario` + `ningun modulo consulta un modelo ajeno con Prisma` (ya existente) |
| R27 | `tests/unit/proveedores/catalog-service.test.ts` + `tests/integration/proveedores/catalog-line.int.test.ts` | `traduce el duplicado del puerto a error de linea repetida` + `el indice unico (supplier_id, product_id) rechaza con SQLSTATE 23505 la segunda linea` |
| R28 | `tests/unit/proveedores/catalog-line-input.test.ts` | `rechaza el costo cero y el costo negativo antes de llegar al repositorio` |
| R29 | `tests/integration/proveedores/catalog-line.int.test.ts` | `el CHECK rechaza con SQLSTATE 23514 la linea con costo cero o negativo, al insertar y al modificar` |
| R30 | `tests/unit/proveedores/catalog-line-input.test.ts` | `rechaza el minimo de compra y el tiempo de entrega negativos, y admite la linea sin ninguno de los dos` |
| R31 | `tests/unit/proveedores/catalog-service.test.ts` | `guarda al actor como autor de creacion y de modificacion de la linea, y al editarla no toca ningun dato del proveedor` |
| R32 | `tests/integration/proveedores/catalog-line.int.test.ts` | `la FK rechaza con SQLSTATE 23503 el autor inexistente y admite la linea sin autor` |
| R33 | `tests/unit/proveedores/catalog-line-input.test.ts` + `tests/unit/proveedores/catalog-service.test.ts` | `el esquema de edicion rechaza un productId o un supplierId de mas` + `la edicion cambia solo costo, minimo y plazo` |
| R34 | `tests/integration/proveedores/catalog-line.int.test.ts` | `al dar de baja la linea su fila deja de existir y el proveedor queda intacto` |
| R35 | `tests/unit/proveedores/catalog-service.test.ts` + `tests/unit/proveedores/supplier-service.test.ts` | `el catalogo se consulta con su propio listado paginado y ordenado` + `ni la ficha ni el listado de proveedores traen las lineas del catalogo` |
| R36 | `tests/integration/proveedores/catalog-line.int.test.ts` | `el listado del catalogo no devuelve ninguna linea de un proveedor dado de baja, aunque las filas sigan en la base` |
| R37 | `tests/integration/proveedores/catalog-line.int.test.ts` | `la linea de un producto dado de baja se conserva y sigue apareciendo en el catalogo de su proveedor` |
| R38 | `tests/unit/proveedores/schema/proveedores-migration.test.ts` + `tests/unit/proveedores/scope.test.ts` | `la migracion solo contiene los tres cambios y no toca ninguna otra tabla` + `esta feature no anade ninguna columna, indice ni restriccion fuera de los tres cambios` |
| R39 | `tests/unit/proveedores/schema/proveedores-migration.test.ts` + task **T16** | `el down.sql recrea las dos restricciones de QC-42 con su definicion literal y borra las dos columnas de autor` + ciclo real `db:migrate` → `db:rollback` → `db:migrate` |
| R40 | `tests/unit/proveedores/schema/proveedores-migration.test.ts` | `toda columna, indice y restriccion nueva esta en ingles y en snake_case` |
| R41 | `tests/unit/proveedores/supplier-input.test.ts` + `tests/unit/proveedores/catalog-line-input.test.ts` | `rechaza la entrada que no cumple el esquema antes de llamar al caso de uso` (en ambos) |
| R42 | `tests/unit/proveedores/supplier-actions.test.ts` + `tests/unit/proveedores/scope.test.ts` | `las mutaciones reciben FormData y las consultas argumentos tipados` + `no hay ningun route handler de proveedores bajo app/api` |
| R43 | `tests/unit/proveedores/supplier-actions.test.ts` | `traduce cada error de dominio a status error con el code estable de la clase, nunca con el texto` |
| R44 | `tests/guards/guard-arquitectura-modulos.test.ts` + `tests/unit/proveedores/module-contract.test.ts` | `domain y ports no importan framework, base de datos, shared ni adaptadores` · `el contrato solo reexporta de ./domain` (ya existentes) + `el catalogo no gana ninguna relacion Prisma hacia Product ni hacia User` |
| R45 | `tests/unit/proveedores/scope.test.ts` + `tests/unit/pagination.test.ts` | `el modulo proveedores no reimplementa el calculo de paginacion` + `usa 10 por defecto y acota a 25` (ya existente) |
| R46 | `tests/guards/guard-dependencias-aprobadas.test.ts` | `toda dependencia de package.json esta en docs/dependencias.md` (ya existente) |
| R47 | `tests/unit/proveedores/scope.test.ts` | `no existe ninguna pantalla, pagina ni componente de proveedores, ni spec E2E nuevo` |

**Guardias y tests que no hay que escribir:** R6, R19 (parte), R26 (parte), R44 (parte), R45
(parte) y R46 los cierran guardias y tests que **ya existen**. Se citan porque un requisito sin test
es un fallo de la feature, no porque haya que tocarlos. Y **ninguno se relaja**: si una guardia se
pone roja, se arregla el código, no la guardia.

**Las tres reglas nuevas de base, en un sitio:** R12 (contacto en blanco) → T17; R29 (costo mayor
que cero) → T18; R32 (autor real de la línea) → T18. Cada una con **su** caso de integración que
demuestra que **Postgres** las rechaza, no que `zod` llegó antes. Un test que se quedara verde
quitando el `CHECK` no cuenta.
