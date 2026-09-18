# QC-92 — ajuste-de-inventario · bitácora de implementación

> Rama `feature/QC-92-ajuste-de-inventario`, desde `origin/dev` en `b579707`.
> Worktree `.worktrees/QC-92-ajuste-de-inventario`.

## T0 — Séptima enmienda del catálogo de errores: **APROBADA**

**Fecha:** 2026-09-17. **Quién:** el humano, expresamente, en la puerta F1.4 junto con el spec.

**Qué se aprobó:** los dos códigos que propone `design.md > 7`:

| Código | Para qué |
|---|---|
| `batch_not_found` | El lote pedido no existe o es de otra empresa (R18) |
| `batch_stock_negative` | El ajuste dejaría el lote bajo cero (R4) |

**Consecuencias, escritas para que no se reabran:**

- **T4 vive** y se implementa: las dos entradas en `ERROR_CODES` + `error-catalog.ts`, la enmienda
  fechada en la cabecera de `error-codes.ts` y las dos clases en `errors.ts` del módulo.
- **El plan B de `design.md > 7` queda descartado.** `batch_not_found` NO cae a
  `product_not_found` y `batch_stock_negative` NO cae a `invalid_input`. T8 no aplica plan B.

## Estado de las tasks

Ver `specs/QC-92-ajuste-de-inventario/tasks.md`.

## Archivos tocados

(se completa por tanda)

## Mapa R<n> -> test

(se completa en T17)

## Salida de los tests

(se completa por tanda)

---

## Tanda 1 — T1, T2 (cerrada)

### Archivos
**Creados**
- `db/migrations/20260917130000_inventory_movements/migration.sql`
- `db/migrations/20260917130000_inventory_movements/down.sql`
- `tests/integration/inventario/inventory-movements-constraints.int.test.ts`

**Modificados**
- `db/schema.prisma` — modelo `InventoryMovement` (`/// @module inventario`) y back-relation `movements` en `ProductBatch`.
- `tests/integration/aislamiento.json` — fila en la lista `transaccion`.
- `tests/guards/guard-identificador-de-request.test.ts` — la migración nueva, añadida a la lista cerrada `MIGRACIONES_ESPERADAS`.

### Dato que arrastran las tandas siguientes
**`LEDGER_START = '20260917130000'`** — el timestamp de la carpeta de la migración. Es lo que T3 escribe en `movement-ledger.ts` y lo que T15 usa como fecha de corte.

### Ciclo de la migración, verificado de verdad
`migrate deploy` → aplica · `pnpm run db:rollback` → revierte por `down.sql` y borra la fila de `_prisma_migrations` · `migrate deploy` otra vez → vuelve a aplicar. `_prisma_migrations` coherente en las tres vueltas.

### Salida real
- `pnpm run typecheck` → verde, sin salida.
- `pnpm run lint` → verde, sin salida.
- `pnpm exec vitest run tests/integration/inventario/inventory-movements-constraints.int.test.ts` → **5 passed (5)**.
- `pnpm exec vitest run guard` → **43 archivos, 511 passed, 9 skipped**.

### Desviaciones declaradas
1. **`companyId` y `createdBy` de `InventoryMovement` no llevan `@relation`.** El design decía «las relaciones (`ProductBatch`, `Company`, `User`) con sus back-relations». El patrón real del esquema es el contrario: ningún campo cuyo destino es de **otro módulo** lleva `@relation` (`ProductBatch.companyId`, `Product.companyId`, `Presentation.unitId`), y es drift a propósito para que ningún `include` cruce la frontera sin que la guardia de módulos lo vea. Solo `batchId` (mismo módulo) lleva `@relation`; las otras dos FK van escritas a mano en el SQL. **Se siguió el patrón real del repo, no la letra del design.**
2. **La fila de `aislamiento.json` no lleva `motivo` ni `desde`.** `tasks.md` los pedía; el archivo solo los admite en la categoría `commit`, y este test se aísla por `prisma.$transaction` + rollback como sus vecinos de `inventario/`, así que va en la lista `transaccion`, donde esas claves no existen.
3. **Se tocó `tests/guards/guard-identificador-de-request.test.ts`,** que no estaba en los archivos de T1. Es obligatorio: esa guardia lleva una lista **cerrada** de migraciones y cualquier migración nueva la pone roja hasta que se nombra. Mismo trámite que ya hicieron `orders_company_scope`, `recipes_company_scope` y `drop_product_stock`. **Es un segundo caso del mismo tipo que la trampa de QC-104 que T9 tiene anotada.**
4. **Los cuatro casos de CHECK/disparador de T2 usan `$executeRaw`**, no `tx.inventoryMovement.create()`: la API tipada envuelve el error y `meta.code` deja de estar disponible. Mismo criterio que ya dejó escrito `tests/integration/inventario/product-batch-write.int.test.ts:379`.

### Nota de entorno
El worktree no traía `node_modules`. Se corrió `pnpm install` + `prisma generate` + `next typegen` para poder ejecutar typecheck/lint/vitest. Son pasos de entorno; no hay cambios de código por ello y `package.json` no cambió (R33).

### Gate de la tanda 1
`./init.sh --rapido` (lo corre el leader): 43 archivos de guardia, **511 passed, 9 skipped**, 28 relacionados, **0 rojos**, `== init OK ==`.

Las cinco desviaciones de arriba quedaron **aceptadas por el leader**. Dos de ellas con anotación propia:

#### Sobre la desviación 1 — por qué `companyId` y `createdBy` no llevan `@relation`
Queda escrito aquí porque el reviewer va a comparar el modelo contra `design.md > 2.1` y **verá la diferencia**. El design pedía las tres relaciones con sus back-relations; el esquema real hace lo contrario y lo hace a propósito: **ningún campo cuyo destino vive en otro módulo lleva `@relation`**. El motivo no es estético — es que un `@relation` habilita un `include` que **cruzaría la frontera de módulo sin que `guard-arquitectura-modulos.test.ts` lo vea**. `ProductBatch.companyId`, `Product.companyId` y `Presentation.unitId` ya lo dejan escrito en sus propios comentarios. Por eso solo `batchId` (mismo módulo `inventario`) lleva `@relation`, y las FK a `companies` y `users` van escritas a mano en el SQL, como drift deliberado. **Se siguió el patrón real del repo por encima de la letra del design, y eso está aprobado explícitamente.**

#### Sobre la desviación 3 — es una **guardia de censo**, la tercera familia
Corrección de categoría, hecha por el leader y anotada aquí para que quede rastro cuando se haga **QC-99**:

`tests/guards/guard-identificador-de-request.test.ts` lleva una **lista cerrada** de migraciones (`MIGRACIONES_ESPERADAS`) y cualquier migración nueva la pone roja hasta que se la nombra a mano. Esto **no** es «un segundo caso de la trampa de QC-104». Es **el mismo patrón de QC-99**, el que ya costó **tres paradas en QC-91**: una **guardia de censo**, la **tercera familia distinta** de trampa que llevamos encontrada en este arnés.

Las tres familias, para que se puedan contar:
1. **Conteo de lecturas de sesión** (QC-104) — toda Server Action nueva que resuelve usuario y empresa entra en la lista. Le toca a **T9**.
2. **Censo de escrituras** (la que nace en esta ficha, R28/T14) — el conjunto nombrado de caminos de escritura de `product_batches`.
3. **Censo de migraciones** (QC-99) — `MIGRACIONES_ESPERADAS`. Le tocó a **T1**.

Todas comparten la forma: una lista cerrada en `tests/guards/` que se pone roja por algo que **no habla de la ficha que la rompió**.

---

## Tanda 2 — T3, T4 (código hecho; la tanda **NO** cierra: hay un bloqueante)

### Archivos
**Creados**
- `lib/modules/inventario/domain/movement-reason.ts` — `MOVEMENT_REASONS` + `MovementReason`
- `lib/modules/inventario/domain/movement-ledger.ts` — `LEDGER_START = '20260917130000'`
- `lib/modules/inventario/domain/inventory-movement.ts` — `InventoryMovementView`, `NewInventoryMovement`
- `lib/modules/inventario/domain/product-batch-view.ts` — `ProductBatchView`
- `tests/unit/inventario/movement-reason.test.ts`

**Modificados**
- `lib/modules/errores/domain/error-codes.ts` — `batch_not_found`, `batch_stock_negative` y la séptima enmienda fechada
- `lib/modules/errores/domain/error-catalog.ts` — clave y texto de cada uno
- `lib/modules/inventario/domain/errors.ts` — `BatchNotFoundError`, `BatchStockNegativeError`
- `tests/unit/errores/catalogo.test.ts` — conteo 46 → 48 y cobertura de los dos códigos nuevos

### La séptima enmienda, texto exacto
```
* **Septima enmienda, el 2026-09-17 (QC-92)**: `batch_not_found`, `batch_stock_negative`.
* Aprobada por el humano el 2026-09-17 en la puerta F1.4 de QC-92.
```

### R9, cómo se probó de verdad
El test **no** cuenta los motivos. Barre las fuentes de `app/` y `lib/` y se pone **rojo si algún archivo que no sea `movement-reason.ts` enumera los motivos a mano**, con caso rojo y caso verde sobre fuentes fabricadas. Contar `MOVEMENT_REASONS.length === 4` no habría probado nada de lo que R9 pide.

### Salida real
- `pnpm run typecheck` → verde · `pnpm run lint` → verde
- `vitest run movement-reason.test.ts catalogo.test.ts guard-catalogo-de-errores.test.ts` → **3 archivos, 62 tests, verdes**
- `vitest related --run <los 7 archivos + sus 2 tests>` → **336 de 337 archivos verdes (5016/5041)**. El único rojo es el bloqueante de abajo.

---

## BLOQUEANTE de la tanda 2 — la guardia R31 de **QC-81**, que el spec no previó

`tests/unit/inventario/qc81-alcance.test.ts` se pone **rojo**. Medido por mí, no reportado de oídas:

```
FAIL tests/unit/inventario/qc81-alcance.test.ts
  > QC-81 R31 — ni existencia por lote (QC-91) ni ajuste de inventario (QC-92)
  > R31: ningun archivo del modulo inventario suma lotes, ajusta ni consume
AssertionError: lib/modules/inventario/domain/inventory-movement.ts:
  nombra un ajuste o consumo: adjustment
Test Files 1 failed (1) · Tests 1 failed | 10 passed | 3 skipped (14)
```

**Por qué salta.** `hallazgosDeAjusteOSuma` (`:242-256`) marca cualquier identificador que contenga una palabra de `PALABRAS_DE_AJUSTE_O_CONSUMO`. `InventoryMovementView.kind` es `'opening' | 'adjustment'`, que es **literalmente lo que `design.md > 4.1` manda escribir**. No hay forma de cumplir el design sin ponerla roja.

**El hallazgo de fondo, y es el que importa.** En ese mismo archivo, R28 (`:359`) y R29 (`:389`) se **acotan a la rama de QC-81** con el helper `archivosOSalto` (`:128-143`): fuera de su rama se saltan ruidosamente. **R31 no lo hace**: recorre `lib/modules/inventario` entero, incondicionalmente, en cualquier rama. Es una asimetría dentro del propio archivo.

**Y su propósito ya se cumplió.** El `describe` se titula *«ni existencia por lote (QC-91) ni ajuste de inventario (QC-92)»*: existía para que **QC-81 no se adelantara** a estas dos fichas. QC-91 ya está en `dev`. **QC-92 es la ficha a la que la guardia le estaba guardando el sitio.**

**No la he tocado.** Es la guardia de otra ficha y `D13` prohíbe tocar una guardia en silencio; además el spec solo previó ajustar la R21 de QC-91 (T7). Queda escalado al leader.

**Cuarta familia de guardia de censo/alcance**, sobre las tres que ya llevábamos contadas arriba:
4. **Guardia de alcance de ficha** (QC-81 R31) — le reserva el sitio a una ficha futura y **no se acota a su rama**, así que se pone roja justo cuando llega la ficha para la que reservaba.

### BLOQUEANTE RESUELTO — R31 acotada a su rama (`be90661`)

**Decisión humana del 2026-09-17: opción 1, acotar.** Descartadas expresamente la retirada de la guardia y la de parar QC-92 para hacer QC-99 antes.

El caso `R31: ningun archivo del modulo inventario suma lotes, ajusta ni consume` ahora llama a `archivosOSalto(ctx)`, el **mismo helper y la misma forma** que sus tres vecinas R28/R29/R30 del mismo archivo. Dentro de la rama de QC-81 el comportamiento es **idéntico al de hoy**: mismo barrido del módulo entero, mismo `toEqual([])`. **Cambia cuándo se aplica, no qué caza.** `PALABRAS_DE_AJUSTE_O_CONSUMO` y `hallazgosDeAjusteOSuma` no tienen ni una línea tocada, y el caso que los prueba con fuentes fabricadas sigue corriendo siempre.

Nota fechada encima del `describe`, **sin citar ninguna ficha** en el comentario.

**Prueba por mutación, las dos caras:**
- **Cara A — rama ajena se salta:** el caso sale `↓` con el motivo visible, igual que sus tres vecinas: *«la rama actual es 'feature/QC-92-ajuste-de-inventario' y no 'feature/QC-81-lote-y-fecha-de-compra' … Este caso NO ha comprobado nada.»*
- **Cara B — el detector no está debilitado:** caso nuevo `R31: fuera de su rama el detector sigue mordiendo sobre el modulo real`, que **no se acota** y corre el barrido real sobre `lib/modules/inventario`, exigiendo hallazgos con `adjustment`. Hoy encuentra `lib/modules/inventario/domain/inventory-movement.ts: nombra un ajuste o consumo: adjustment`.

Salida: `Test Files 1 passed (1) · Tests 11 passed | 4 skipped (15)`. `typecheck` y `lint` verdes.

#### Riesgo del caso de la Cara B, declarado y no disimulado
El caso nuevo **fija el estado del árbol**: afirma que hoy existe un identificador con `adjustment` en el módulo. Si una ficha futura renombrara ese literal —legítimamente—, el caso se pondría rojo. **Es el mismo patrón que `design.md > 5.1` descarta** para la R21 de QC-91 («invertir la afirmación fijaría un estado que otra ficha puede cambiar legítimamente», el error que el reviewer de QC-91 evitó).

Se acepta aquí por una razón concreta: **es la única forma de demostrar la Cara B contra el árbol real**, que es lo que se pidió, y el caso hermano que prueba los detectores con **fuentes fabricadas** —el que no fija estado— sigue vivo e intacto al lado. Queda escrito para que el reviewer lo juzgue a la vista y no lo descubra.

**Aviso para T7:** la R21 de QC-91 **no** se hace así. Ahí la instrucción es explícita —no invertir la afirmación— y se acota con `cuerpoDeFuncion`.

---

## Inventario de familias de guardia de censo/alcance (para **QC-99**)

Confirmado por el leader el 2026-09-17. **Cuatro familias distintas encontradas en dos fichas**, y hoy no están escritas en ningún otro sitio. Todas comparten la forma: **una lista o afirmación cerrada en `tests/` que se pone roja por algo que no habla de la ficha que la rompió.**

| # | Familia | Dónde vive | Qué la dispara | A quién le tocó |
|---|---|---|---|---|
| 1 | **Conteo de lecturas de sesión** | guardia de QC-104 | Una Server Action nueva que resuelve usuario y empresa y no se anota en la lista | **T9** (avisado en `tasks.md`) |
| 2 | **Censo de escrituras** | `tests/guards/guard-libro-de-inventario.test.ts` (nace en esta ficha) | Un camino de escritura de `product_batches` fuera del conjunto nombrado, o sin su asiento | **T14** |
| 3 | **Censo de migraciones** | `tests/guards/guard-identificador-de-request.test.ts`, `MIGRACIONES_ESPERADAS` | **Cualquier** migración nueva, hasta que se la nombra a mano | **T1** (no estaba previsto) |
| 4 | **Guardia de alcance de ficha** | `tests/unit/inventario/qc81-alcance.test.ts`, R31 | Le reserva el sitio a una ficha futura y **no se acota a su rama**: se pone roja **justo cuando llega la ficha para la que reservaba** | **Tanda 2** (no estaba previsto) |

Las dos que **no** estaban previstas en el spec son la 3 y la 4, y las dos costaron una parada. La 4 además reveló una **asimetría dentro de su propio archivo**: R28, R29 y R30 se acotaban a su rama y R31 no.

---

## Tanda 3 — T5 → T6 → T7 (bloque cerrado, sin gate en medio)

### Archivos
**Creados**
- `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`
- `tests/unit/inventario/adjust-batch-stock-prisma.test.ts`
- `tests/unit/inventario/batch-movement-prisma.test.ts`

**Modificados (producción)**
- `lib/modules/inventario/ports/product-repository.ts` — los tres métodos nuevos
- `lib/modules/inventario/adapters/driven/persistence/company-scope.ts` — `batchCompanyScope` reintroducida, `movementCompanyScope` nueva
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` — asiento de alta en las dos entradas, `findBatchesOfAliveProduct` y `adjustBatchStock`
- `lib/composition/index.ts` — cableado de los tres

**Modificados (tests)**
- `tests/unit/inventario/qc91-alcance.test.ts` (T7)
- `tests/guards/guard-ambito-empresa-inventario.test.ts`
- Siete dobles de `ProductRepository` y cinco fixtures de integración (mecánico)

### El paso por rojo, tal como estaba declarado
`079a0c2` (T5) **no compila por sí solo** y el cuerpo del commit lo dice con esas palabras. `8c87ab5` (T6) lo cierra. No se corrió gate entre los dos.

### La guardia R21, acotada sin invertir
Las ramas de `delete`, `deleteMany`, `upsert`, `updateMany` y los dos SQL crudos **quedan intactas**. La de `update` pasa de «hallazgo del archivo» a «hallazgo **fuera** de `adjustBatchStock`», aislado con el `cuerpoDeFuncion` que ya existía. **No hay ninguna aserción que exija que `adjustBatchStock` DEBA tener un `update`**: eso fijaría un estado que otra ficha puede cambiar, que es lo que el reviewer de QC-91 evitó. Nota fechada sin citar fichas, y prueba por mutación con fuentes fabricadas.

### Hallazgo: `cuerpoDeFuncion` venía funcionando por casualidad
El helper buscaba la primera `{` tras el primer `)`. Con un tipo de retorno que trae sus propias llaves —`Promise<{ stock: number } | null>`— capturaba **la llave del TIPO, no la del cuerpo**. Nunca se había notado porque las aserciones que lo usaban no dependían de tener el cuerpo correcto. Corregido con control de profundidad de paréntesis y de `<>`/`{}`, y con su autoprueba para ese caso exacto. **Es un fallo preexistente que esta ficha destapó, no uno que introdujera.**

### Desviaciones declaradas
1. **`lib/composition/index.ts`, fuera de los archivos de la task.** Ampliar el puerto rompe el objeto que lo satisface en composición; sin cablear los tres métodos, «verde al final de T7» era imposible.
2. **`tests/guards/guard-ambito-empresa-inventario.test.ts`, fuera de la task.** Esa guardia asumía **un** archivo adaptador por puerto. Como el diseño pide que `findBatchMovements` viva en `batch-movement-prisma.ts`, no lo encontraba. `adaptador: string` pasó a `adaptadores: readonly string[]`; la lógica de sus dos comprobaciones no cambió.
3. **Cinco fixtures de integración necesitaron `inventoryMovement.deleteMany(...)` antes del `productBatch.deleteMany(...)`.** La FK es `RESTRICT` y hasta T6 nunca se escribía un asiento, así que nunca mordía. **Es una consecuencia directa y esperada del libro, no un parche.**
4. **`authorName` sale hoy como el identificador crudo del actor, no como nombre mostrable.** Resolverlo en la persistencia exigiría que un driven de `inventario` leyera `users`, que es de otro módulo, y `docs/architecture.md > Anti-patrones` lo prohíbe. `identity` ya resolvió esto con el puerto `PeopleDirectory`, consumido **desde el caso de uso**. **PENDIENTE EXPLÍCITO PARA T8**: inyectar `PeopleDirectory` y resolver el nombre ahí. Mismo criterio que «un responsable que no vuelve del directorio sale con su identificador».
5. **`adjustBatchStock` usa `tx.productBatch.update({ stock: { increment: delta } })`, no el `$queryRaw` del pseudocódigo de `design.md > 4.3`.** Sigue siendo el `SET stock = stock + $delta` **relativo** que el diseño exige, y es lo que la task pedía literalmente («la única función que llama a `tx.productBatch.update(...)`») y sobre lo que se construyó la guardia de T7. El SQL crudo habría disparado además la rama de «`UPDATE` crudo prohibido» de esa misma guardia.
6. **La comprobación previa en la aplicación del stock negativo no se implementó.** El diseño decía que la aplicación «también» comprueba antes para dar un mensaje útil; hoy la única barrera es el `CHECK` de la base, traducido por nombre de restricción a `BatchStockNegativeError`. **La garantía dura, que es lo que exigen R4 y R5, está cumplida**; lo que falta es el mensaje anticipado. Se declara en vez de darlo por hecho.

### Riesgo declarado
**`where: { id: batchId, companyId }` en `update()` no está probado contra Postgres real.** Los tests de T6 usan Prisma mockeado, y un mock no demuestra que Prisma acepte esa combinación ni que lance `P2025` sin fila. Es válido —Prisma 6.19.3, filtro extendido en `where`— pero **quien lo demuestra de verdad es el test de integración de T15**. Si ahí falla, se cae el `null` de R18.

### Salida real
- `pnpm run typecheck` → verde · `pnpm run lint` → verde
- `qc91-alcance` + `adjust-batch-stock-prisma` + `batch-movement-prisma` + `guard-ambito-empresa-inventario` → **4 archivos, 64 passed**
- `vitest run guard` → 43 archivos, **515 passed, 9 skipped, 0 failed**
- Un rojo **ajeno**: `tests/unit/configuracion-ui/user-table.test.tsx`, el flake conocido de jsdom («navigation to another Document»); corrido solo, sus 27 pasan.

### Limpieza de comentarios (`934fe7c`, commit aparte)
Seis líneas **nuevas** de producción citaban `QC-92` o `R18` —los tres docblocks del puerto y una línea de `batch-movement-prisma.ts`—. Limpiadas, sin tocar una línea de código. Los comentarios **preexistentes no se arrastran**. Comprobado sobre el diff de la rama: **la única cita que queda en producción es la cabecera de enmiendas de `error-codes.ts`**, que es un registro histórico y ya citaba las seis anteriores.
