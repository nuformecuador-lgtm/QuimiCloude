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
Seis líneas **nuevas** de producción citaban `QC-92` o `R18` —los tres docblocks del puerto y una línea de `batch-movement-prisma.ts`—. Limpiadas, sin tocar una línea de código. Los comentarios **preexistentes no se arrastran**. Comprobado sobre el diff de la rama: **la única cita que quedaba en producción era la cabecera de enmiendas de `error-codes.ts`**, que es un registro histórico y ya citaba las seis anteriores.

> **CORRECCIÓN del 2026-09-18 (vuelta de review).** Esa frase **dejó de ser cierta en T13bis**, que reescribió el docblock de `product-list-section.tsx` y lo dejó con un `**R5**` dentro. No se escribió en pasado por precisión: se escribió como si valiera para siempre, y nadie volvió a medirla. El reviewer la cazó. Limpiada en `451b8c9`, commit de **solo comentarios**, y vuelta a medir sobre el diff de producción de toda la rama: la única cita que queda hoy es la de `error-codes.ts`. **Tercera vez en esta ficha.**

### Medición pedida sobre la Cara B de R31 — **el leader tenía razón** (`55b00d1`)

**Qué se midió.** Si el caso podía afirmar que *el barrido se ejecutó* en vez de *qué encontró*, sin dejar de distinguir un barrido roto.

**Resultado: sí, y además la forma vieja no aportaba nada.** El caso hermano `R31: los detectores muerden con fuentes fabricados y no con uno limpio` ya prueba **las cuatro ramas** del detector —`_sum`, `SUM(...)`, `increment`/`decrement` y **la de identificadores** (`createAdjustInventory`, `consumirLote`)—. Debilitar el detector ya daba rojo ahí. La aserción sobre `adjustment` solo añadía el riesgo de falso rojo ante un renombrado legítimo.

**Forma nueva:** más de diez archivos reales del módulo, contenido leído de verdad (no cadenas vacías) y el detector invocado sobre cada uno, **sin ninguna aserción sobre el contenido de los hallazgos**. Renombrado a `R31: el barrido recorre de verdad los archivos del modulo`, porque el nombre anterior habría pasado a ser mentira.

**Probado por mutación, las dos:** lista de archivos vacía → rojo (`expected 0 to be greater than 10`); lectura fabricada en vez de real → rojo (`expected false to be true`). **Distingue.**

**La desviación 1 de la tanda 2 queda retirada:** ya no se fija ningún estado del árbol. Y con ella se evita crear otra guardia de la familia 2 por nuestra propia mano.

---

## BLOQUEANTE NUEVO — **R32 de QC-81**, hermana de R31 y con el mismo defecto

Lo reportó el subagente como «preexistente y no relacionado». **Lo medí y es falso: lo causa nuestra T5.**

```
FAIL tests/unit/inventario/qc81-alcance.test.ts
  > QC-81 R32 — el contrato de inventario no expone listar, editar ni borrar lotes
  > R32: y el puerto de producto tampoco declara ninguna
AssertionError: expected [ 'findBatchMovements', 'findBatchesOfAliveProduct' ] to deeply equal []
```

**Medición.** En `origin/dev` el puerto **no declara ningún `findBatch*` ni `adjustBatch*`**, así que R32 estaba verde. `operacionesDeLoteProhibidas` marca todo nombre que junte una palabra de lote (`batch`) con una operación prohibida (`find`). **T5 añadió `findBatchesOfAliveProduct` y `findBatchMovements`, que es exactamente lo que `design.md > 4.2` manda declarar.**

**Mismo defecto que R31:** `R32: y el puerto de producto tampoco declara ninguna` **no llama a `archivosOSalto(ctx)`**. Corre en cualquier rama. Es el **mismo archivo, la misma ficha y la misma familia 4**.

**Y el mismo propósito cumplido:** el `describe` se titula «el contrato de inventario no expone listar, editar ni borrar lotes». QC-92 **es** la ficha que legítimamente expone la lectura de lotes: el panel del producto (R22) y el historial (R23) no existen sin ella.

**No la he tocado.** La decisión del leader sobre R31 fue para R31; no la extiendo por mi cuenta a otra guardia.

**Lección de proceso, y es la segunda vez:** un subagente etiquetó como «ajeno y preexistente» un rojo que había causado él mismo. Es exactamente lo que `AGENTS.md > Regla del gate` advierte —el subagente no tiene contexto para juzgar un rojo— y la razón por la que el implementer verifica antes de commitear.

---

## Dos desviaciones, cerradas — no arrastradas

### Desviación 6 → **CAMBIO DE DISEÑO DECLARADO**, no deuda

`design.md > 4.3` decía: «La aplicación **también** lo comprueba antes, para dar un mensaje útil; la garantía dura sigue siendo la base». **Esa comprobación previa no se implementó, y no se va a implementar.** La razón, medida:

1. **El mensaje útil ya se da.** El `23514` de `product_batches_stock_non_negative` se traduce **por el nombre de la restricción** a `BatchStockNegativeError`, cuyo texto es «El ajuste dejaria la existencia del lote por debajo de cero». Es exactamente el mensaje accionable que la comprobación previa buscaba. **No se pierde nada de lo que el design quería.**
2. **La comprobación previa reintroduciría el bug que esta ficha existe para quitar.** Leer el `stock`, decidir en la aplicación y después escribir es **leer-y-escribir no atómico**: entre la lectura y el `UPDATE` cabe otro ajuste. Es el mismo argumento con el que `design.md > 4.1` prohíbe que el dominio calcule el total y lo escriba, y con el que `> 6` descarta la alternativa 5. Una comprobación previa **no vinculante** daría además falsos negativos bajo concurrencia: aprobaría un ajuste que la base rechazará igual.
3. **R4 y R5 no dependen de ella.** R4 exige rechazar y no dejar escrito **ni el asiento ni la existencia**: eso lo da el `CHECK` dentro de la transacción, que revierte las dos escrituras. R5 exige que el `CHECK` siga intacto y que la base rechace por su cuenta **por cualquier vía**: una comprobación en la aplicación no ayudaría a eso, y de hecho invita a confiar en ella.

**Dónde quedan mapeados R4 y R5, con test real y no con una nota:**
- **R5** — `tests/integration/inventario/inventory-movements-constraints.int.test.ts`: caso de `stock` negativo escrito **por SQL crudo**, rechazado por `product_batches_stock_non_negative`. Es la vía que ninguna comprobación de aplicación cubre.
- **R4** — `tests/unit/inventario/adjust-batch-stock-prisma.test.ts`: el `23514` con ese nombre de restricción se traduce a `BatchStockNegativeError` y **no queda escrito ni el asiento ni el cambio**.
- **R4 extremo a extremo** — `e2e/ajuste-de-inventario.spec.ts` (**T16**).

### Desviación 4 → **PENDIENTE DE T8**, y no está hecha

`authorName` sale **hoy** como el identificador crudo del actor. **R23 pide autor, y un UUID en pantalla no es un autor.** Aprobado por el leader el plan: **en T8**, inyectar el puerto `PeopleDirectory` de `identity` en el caso de uso y resolver ahí el nombre — **nunca en la persistencia**, porque un driven de `inventario` leyendo `users` es lo que prohíben los anti-patrones. Es el patrón que `identity` ya usa en `list-order-responsibles.ts`.

**Hasta que T8 lo cierre, R23 NO está cumplido.** Queda escrito así para que no se dé por hecho.

---

## Lección de proceso — **dos veces en una ficha**

**Un subagente etiquetó como «ajeno y preexistente» un rojo que había causado él mismo.** Dos casos medidos en esta ficha:

1. La lista cerrada de migraciones de `guard-identificador-de-request.test.ts`, que el subagente sí anotó pero clasificó como trampa de QC-104 cuando era un censo de QC-99.
2. **R32 de QC-81**, reportado literalmente como «preexistente y no relacionado con mi cambio». Medido: en `origin/dev` el puerto declara **0** `findBatch*`; en la rama, **2**. **Lo causó su propia T5.**

Es exactamente lo que advierte `AGENTS.md > Regla del gate`: *«el subagente no tiene el contexto para juzgar un rojo ajeno… Un rojo mal diagnosticado por un subagente cuesta más que la corrida que se ahorró»*. Los dos se cazaron **verificando antes de commitear**, no confiando en el reporte. **El implementer no debe commitear un veredicto de subagente sin medirlo.**

---

## Predicción anotada: el caso del **barrel** de R32 se pondrá rojo en **T8**

Hoy `R32: ningun export del contrato publico denota listar, editar ni borrar lotes` está **verde**, y por eso **no se toca ahora**. Pero mira las claves del barrel de `inventario`, y T8 va a exportar los casos de uso `listProductBatches` y `listBatchMovements`. `operacionesDeLoteProhibidas` parte el nombre en palabras: `listProductBatches` → `list` (operación prohibida) + `batches` (palabra de lote) ⇒ **infractor**.

**Se anota ahora, con la predicción hecha antes de que ocurra, para que en T8 no se lea como una sorpresa** ni se «arregle» renombrando un caso de uso para esquivar una guardia. Es el mismo defecto de familia 4 en su tercer caso del mismo archivo.

---

## Tanda 4 — T8, T9 (código hecho y commiteado; la tanda **NO** cierra: el gate está rojo)

Commits: `9b58bc8` (T8) y `1ef5f2a` (T9). **Ninguna de las dos tasks se marca `[x]`**: el «Hecho»
de T9 es `./init.sh --rapido` verde, y no lo está.

### Archivos

**Creados**
- `lib/modules/inventario/domain/adjust-batch-stock.ts`
- `lib/modules/inventario/domain/list-product-batches.ts`
- `lib/modules/inventario/domain/list-batch-movements.ts`
- `lib/modules/inventario/adapters/driving/batch-actions.ts`
- `tests/unit/inventario/adjust-batch-stock.test.ts`
- `tests/unit/inventario/batch-actions.test.ts`

**Modificados**
- `lib/modules/inventario/index.ts` — las tres fábricas, sus tipos de deps, `ProductBatchView`,
  `InventoryMovementView`, `NewInventoryMovement`, `MOVEMENT_REASONS`/`MovementReason` y las dos
  clases de error nuevas.
- `lib/composition/index.ts` — las tres claves nuevas de la fachada, **al final y sin reordenar nada**.
- `tests/unit/inventario/authorization.test.ts` — de nueve a **doce** casos de uso.
- `tests/unit/identity/session-once-per-request-actions.test.ts` — la fila del censo de QC-104.

### La desviación 4 queda **CERRADA**: R23 ya tiene autor y no UUID

`list-batch-movements.ts` recibe el puerto `PeopleDirectory` de `identity` —**solo el tipo, por el
contrato público**— y resuelve el nombre en el caso de uso, con
`findRefsIncludingDeletedInCompany`: un autor no desaparece del historial porque su cuenta se
desactive. El que no vuelve del directorio **sigue saliendo con su identificador**; no hay `filter`.
La persistencia no se tocó: un driven de `inventario` leyendo `users` es el anti-patrón que esto
evita. Mismo patrón que `list-order-responsibles.ts`.

### La trampa de QC-104, cerrada como estaba previsto

Las tres acciones resuelven las dos caras de la sesión, así que el archivo entra en `ACCIONES` con
su fila. `archivosConLasDosCaras()` y las dos comprobaciones contra el árbol quedan **intactas**:
el censo crece, no se afloja. Los dos casos de conteo pasan para la fila nueva.

### La trampa de orden de la composición (no estaba en el spec, se declara)

`peopleDirectory` se declara en `lib/composition/index.ts:987`, **después** de la fachada de
`inventario` (~664): usarla ahí sería una referencia a un `const` en zona muerta y habría reventado
en tiempo de ejecución, no en `typecheck`. Se nombra el import de valor `assignmentDirectoryPrisma`
(`:286`), que se iza y es el **mismo objeto**, y no se movió ninguna declaración existente.
Comprobado que el módulo **carga**, no solo que compila (`tests/unit/composition`: 2 archivos, 23
casos verdes).

### Salida real del gate

`./init.sh --rapido` → **ROJO**. `347 archivos, 3 failed | 5177 passed | 26 skipped (5206)`.
Los tres rojos, **medidos uno a uno contra `origin/dev`, ninguno aceptado de oídas**:

| Rojo | Causa | ¿Nuestro? |
|---|---|---|
| `module-contract.test.ts:152` (QC-90 R30) | los exports `createListProductBatches` / `createListBatchMovements` del barrel | **Sí, T8** |
| `qc81-alcance.test.ts:565` (QC-81 R32) | los mismos dos exports, mismo detector | **Sí, T8** |
| `configuracion-ui/user-table.test.tsx` | el flake conocido de jsdom | **No**: el archivo es idéntico a `origin/dev` y corrido solo da **27 passed** |

Guardias, corridas aparte porque `test:rapido` **no llega a ellas cuando la selección relacionada
falla** (el `if (status === 0)` del final de `scripts/test-rapido.mjs`): `vitest run guard` → **43
archivos, 515 passed, 9 skipped, 0 rojos**.

`pnpm run typecheck` y `pnpm run lint` → verdes.

### BLOQUEANTE 1 — los dos casos del **barrel**: la predicción se cumplió, y son DOS, no uno

La bitácora predijo el caso del barrel de R32 antes de que ocurriera. Se cumplió, **y tiene un
gemelo que no estaba predicho**: `tests/unit/inventario/module-contract.test.ts:152`, el caso
«QC-90 R30 — ningún export del contrato denota listar, editar ni borrar lotes». Corre el **mismo
detector** (palabra de lote + operación prohibida) sobre las **mismas claves del barrel**, así que
la causa es una sola y la decisión tiene que cubrir **dos archivos**.

**Medición, no veredicto:** en `origin/dev` el barrel solo publica `BatchDuplicateLotError`,
`PRODUCT_BATCH_LOT_MAX_LENGTH`, `createProductWithFirstBatchSchema`,
`CreateProductWithFirstBatchInput` y `NewProductBatch` — ninguno infractor. `HEAD` antes de esta
tanda era **idéntico** a `origin/dev` en ese archivo. Los dos infractores son exactamente los dos
exports que entra T8.

**Lo que dice el precedente de esta misma rama.** `921e224` acotó el caso *del puerto* de R32 y dejó
escrito, con todas las letras, que el del barrel «sigue limpio, y **es lo que R32 protege de
verdad**». Ya no sigue limpio. Y el mensaje de error de QC-90 R30 dice: «Listar, editar y borrar
lotes **NO tiene ficha** (`requirements.md > Lo que NO entra`): si hace falta, **se pide una**».
**QC-92 es esa ficha**: R22 exige el panel que lista los lotes y R23 el historial. La premisa de las
dos guardias está superada por una ficha aprobada, no esquivada.

**No se ha tocado nada.** Ni los detectores, ni `OPERACIONES_PROHIBIDAS`, ni `PALABRAS_DE_LOTE`, ni
se renombró ningún caso de uso para esquivar la guardia. **La decisión es del leader.**

### BLOQUEANTE 2 — `inventario-schema.test.ts`: **cuatro rojos que llevan tres tandas escondidos**

`tests/unit/inventario/schema/inventario-schema.test.ts` tiene **4 casos rojos** y el gate rápido
**no los ve**. Medidos:

| Caso | Qué afirma | Causa |
|---|---|---|
| `:246` | el esquema declara **exactamente** `Presentation`, `Product`, `ProductBatch` | `InventoryMovement`, de **T1** |
| `:631` | los **tres** modelos declaran `/// @module inventario` | `InventoryMovement`, de **T1** |
| `:823` | `ProductBatch` conserva **exactamente** sus columnas | la back-relation `movements`, de **T1** |
| `:685` | la lista cerrada de factorías del barrel | las tres fábricas de **T8** |

**Tres de los cuatro son de T1**, commiteada en `842d63d`. `db/schema.prisma` no se ha tocado desde
entonces (`git diff HEAD -- db/schema.prisma` vacío), así que **esos tres están rojos desde la tanda
1**, que se cerró con el gate en verde. Y la tanda 3 también.

**Por qué el gate no los vio, medido sobre `scripts/test-rapido.mjs`:**
1. `changedFiles()` filtra a `.ts|.tsx|.js|.jsx|.mjs|.cjs`. **`.prisma` y `.sql` quedan fuera**, así
   que una migración o un cambio de esquema no selecciona nada.
2. Este archivo **lee el barrel como TEXTO** —un regex sobre el contenido, no un import— y lee
   `db/schema.prisma` del disco. **No importa nada de lo que vigila**, así que ningún grafo de
   imports lo relaciona jamás.
3. Vive en `tests/unit/`, no en `tests/guards/`, así que tampoco entra por el patrón `guard`.

Es **una guardia de censo en la carpeta equivocada**, y es exactamente el riesgo que
`design.md > 5.2` de esta ficha dejó escrito para T14: «en `tests/guards/` y **no** en `tests/unit/`
porque no la selecciona ningún grafo de imports». Aquí está el caso real de lo que ese párrafo
predice.

**Quinta familia** sobre las cuatro ya inventariadas, y la primera cuyo defecto es **dónde vive**:

| # | Familia | Dónde vive | Qué la dispara | A quién le tocó |
|---|---|---|---|---|
| 5 | **Censo de esquema fuera de `tests/guards/`** | `tests/unit/inventario/schema/inventario-schema.test.ts` | Un modelo, una columna o una factoría nueva; **invisible al gate rápido** por partida triple | **T1** (3 casos, desde `842d63d`) y **T8** (1 caso) |

**No se ha tocado.** Actualizar esas cuatro listas cerradas es el mismo trámite mecánico que T1 ya
hizo con `MIGRACIONES_ESPERADAS`, pero es una guardia de otra ficha y **la decisión es del leader**.

### Desviaciones declaradas de la tanda 4

1. **`authorName` transporta el identificador entre el puerto y el caso de uso.** El adaptador lo
   rellena con `created_by` y `list-batch-movements.ts` lo sustituye por el nombre mostrable. Lo
   limpio habría sido un `authorId` aparte en `InventoryMovementView`, pero eso obliga a tocar
   `inventory-movement.ts` y `batch-movement-prisma.ts`, que son de **T6** y no de T8. Se respetó la
   lista de archivos de la task y queda **escrito en el docblock** del caso de uso. **A la vista del
   reviewer, no descubierto por él.**
2. **`AdjustBatchStockInput` se exporta por el barrel** (el `z.infer` del esquema) aunque la task no
   lo pedía: lo va a necesitar el diálogo de T12 para tipar el formulario. No es infractor de
   ninguno de los dos detectores del barrel (comprobado).

### Lección de proceso, tercera vez y esta vez **no** falló

Los dos subagentes de esta tanda reportaron sus rojos **con la medición contra `origin/dev` hecha
por ellos**, y el de T9 encontró y escaló por su cuenta los cuatro rojos de `inventario-schema` que
no estaban en su lista de rojos conocidos. Aun así **los tres se volvieron a medir aquí antes de
commitear**, que es la regla. Ninguno resultó mal diagnosticado.

---

## T9bis — ENMIENDA AL SPEC del 2026-09-18, y la tanda 4 **CIERRA EN VERDE**

**Aprobada por el humano el 2026-09-18**, escrita como task propia en `tasks.md` —una enmienda
aprobada se escribe en el spec, no solo aquí; es el precedente de las dos enmiendas de QC-81—.
Commit `b8cd2b6`.

Los rojos heredados eran **seis**, no cinco: los conté mal al escalar. Dos de política y cuatro de
censo. **Dos familias, trato distinto, sin mezclarlas.**

### Familia A — los dos del barrel: **DEROGADOS**, no acotados por rama

`qc81-alcance.test.ts` (QC-81 R32, caso del barrel) y `module-contract.test.ts` (QC-90 R30). Son
prohibiciones de **política**, no censos de estado, y su premisa está superada: el propio mensaje de
R30 decía que listar lotes «**NO tiene ficha**: si hace falta, **se pide una**», y **QC-92 es esa
ficha** (R22 el panel, R23 el historial).

**Por qué NO se acotó por rama**, aunque sea el precedente de R31 y del caso del puerto de R32 en
esta misma ficha (`be90661`, `921e224`): aquello era un estado **transitorio de rama**; esto es
**permanente tras el merge**. Acotar habría dejado la guardia roja al mergear y —peor— habría dejado
escrita en el archivo una afirmación falsa.

**Cómo, sin tocar el mecanismo:** una constante local **cerrada** con los diez verbos de lectura que
la derogación retira, y un envoltorio que **invoca el detector tal cual** y descarta los nombres cuya
única operación prohibida está derogada. `operacionesDeLoteProhibidas`, `OPERACIONES_PROHIBIDAS`,
`PALABRAS_DE_LOTE`, `palabras`, `words` y `metodosDePuerto` no tienen **ni una línea** tocada.
**Editar y borrar siguen prohibidos.** Los `describe` y los `it` se renombraron: decían «listar,
editar ni borrar» y eso habría pasado a ser mentira.

**La señal de que el mecanismo no se debilitó:** el caso `R32: el detector muerde con listar, editar
y borrar lotes, y no con el alta` **queda intacto**, sigue esperando `listProductBatches` entre sus
infractores y **sigue verde**.

### Familia B — los cuatro del censo de esquema: **ACTUALIZADOS** a la verdad nueva

| Caso | Qué cambió |
|---|---|
| `:234` | el censo de modelos del módulo pasa de tres a **cuatro** (`InventoryMovement`), y el `it` se renombra: decía «exactamente dos modelos nuevos» y ya era mentira **antes** de esta ficha |
| `:623` | mismo censo, más `owners.get('InventoryMovement')`; `it` renombrado a «los cuatro modelos» |
| `:685` | la lista cerrada de factorías del barrel pasa de **nueve a doce**. La segunda mitad del caso —que ninguna pantalla importe factorías del barrel— **no se tocó y sigue mordiendo** |
| `:836` | **`movements` NO entra en `PRODUCT_BATCH_COLUMNS`**: es una back-relation, no una columna, y en la base no existe. Se excluye **por tipo**, igual que ya se excluían `Product` y `Presentation`. El censo de columnas sigue siendo **igualdad exacta** |

### Pruebas por mutación — las seis, y las dos caras donde hacía falta

- **Familia A**, con nombres **fabricados** dentro del archivo (no sobre el barrel real, para no
  fijar el estado del árbol): `deleteBatch`, `updateLot`, `borrarLotes`, `editBatch`, `removeBatch`
  ⇒ **siguen rojos**; `listProductBatches`, `findBatchMovements`, `getBatch` ⇒ **ya no**; el alta ⇒
  nunca estuvo prohibida. Y **sobre el árbol real**: un `export { … as createDeleteBatch }` en el
  barrel pone **rojos los dos** archivos. Revertido.
- **Familia B**, rompiendo el árbol y revirtiendo: un quinto modelo `/// @module inventario` ⇒ rojos
  `:234` y `:623`; una factoría de más en el barrel ⇒ rojo `:685`, y un import de factoría en
  `page.tsx` ⇒ roja la segunda mitad (probado con una factoría vieja **y** con una nueva); y en
  `:836` **las dos caras**: una **columna** de más ⇒ rojo, la **back-relation** ⇒ ya no.
  Todas revertidas; `git status` quedó limpio en producción.

### Gate de la tanda 4 — **VERDE**

```
./init.sh --rapido
  Test Files  348 passed (348)
       Tests  5210 passed | 26 skipped (5236)
  [test:rapido] todas las guardias
  Test Files  43 passed (43)
       Tests  515 passed | 9 skipped (524)
  ✓ test:rapido paso · ✓ todas las migraciones tienen down.sql · == init OK ==
```

`typecheck` y `lint` verdes.

**Y, sabiendo que el modo rápido puede no verlo todo, el censo de esquema corrido A MANO:**

```
pnpm exec vitest run tests/unit/inventario/schema/inventario-schema.test.ts
  Test Files  1 passed (1)
       Tests  28 passed (28)
```

Antes de T9bis ese mismo archivo daba **4 failed | 24 passed**.

**El flake de `configuracion-ui/user-table.test.tsx` no reapareció** en esta corrida: pasó dentro de
los 348. Es ajeno —el archivo es idéntico a `origin/dev`— y queda anotado, no arreglado.

### La deuda del gate rápido, anotada y no parcheada

Decisión del humano del 2026-09-18: **se anota y QC-92 no se para.** El agujero es del **modo
`--rapido`**, no del gate: **`./init.sh` completo sí habría cazado esos cuatro rojos**, y el cierre
de la feature lo exige de todas formas. Tocar `scripts/test-rapido.mjs` o mover el censo a
`tests/guards/` es cambiar el arnés, y eso va por `/afinar-regla` **en frío**: un parche a mitad de
una feature en vuelo puede poner rojas las otras ramas vivas (QC-68, QC-59, QC-96). **No se tocó
ninguna de las dos cosas.** Queda escrito en `progress/current.md > Deudas y cosas abiertas` con las
tres causas simultáneas y como **quinta familia** del inventario de guardias.

### Estado

**T8, T9 y T9bis marcadas `[x]`.** La tanda 4 cierra. La desviación del `authorName` queda **como
estaba, aceptada y a la vista del reviewer**: no se tocó.

---

## Tanda 5 — T10, T11, T12, T13 (la pantalla). Gate **VERDE**; T13 queda `[ ]` con un bloqueante escalado

### Archivos

**Creados**
- `app/(private)/inventario/components/product-batches-panel.tsx` — `ProductBatchesPanel` (T10)
- `app/(private)/inventario/components/batch-history.tsx` — `BatchHistory` + `movementReasonLabel` (T11)
- `app/(private)/inventario/components/adjust-batch-dialog.tsx` — `AdjustBatchDialog` (T12)
- `tests/unit/inventario/product-batches-panel.test.tsx`
- `tests/unit/inventario/batch-history.test.tsx`
- `tests/unit/inventario/adjust-batch-dialog.test.tsx`
- `tests/unit/inventario/product-batches-sheet.test.tsx` — el enganche de T13 (**archivo no listado en la task**, ver desviación 3)

**Modificados**
- `app/(private)/inventario/components/index.ts` — los tres componentes salen por el barrel
- `app/(private)/inventario/components/product-table.tsx` — `ProductBatchesSheet` (componente local, no exportado) en las acciones de fila, y `canAdjust` en `ProductTableProps`
- `app/(private)/inventario/components/product-list-section.tsx` — transporta `canAdjust` hasta la tabla; **no lee la sesión** (ver bloqueante)
- `tests/unit/inventario/product-page.test.tsx` — doble de `batch-actions` (ver desviación 2)

### Cómo quedó compuesta la pantalla

La fila del listado abre un panel lateral que pide `listProductBatchesAction(product.id)` al abrirse
(estados: en vuelo, error con `role="alert"`, y el panel). El panel es **puramente presentacional**:
recibe los lotes y las unidades por props y expone dos ranuras —`renderBatchDetail` y
`renderBatchActions`—, el mismo patrón que `buildProductColumns({ rowActions })` ya usaba en esta
ruta para que la declaración no importe diálogos. En esas ranuras entran el historial y el ajuste.
Tras un ajuste con éxito el panel vuelve a pedir los lotes, así que la existencia nueva se ve.

Las tres cosas de contenido que el encargo señalaba:
- **Cantidad con su unidad, sin convertir**: se pinta `batch.stock` tal cual y la unidad sale de
  `batch.unitId` resuelto contra el catálogo (`symbol ?? name ?? EMPTY_CELL`). Sin catálogo, la
  cantidad va sola. Hay caso de test que afirma que **el número pintado es exactamente `stock`**.
- **Lote sin asientos**: texto propio (`batch-history-before-ledger`) que dice que es anterior al
  libro de movimientos. El test distingue **los tres** estados —lista, sin asientos, error— por
  marcadores distintos y afirma que ninguno se confunde con otro.
- **Sin `inventario.modificar` el control no existe en el DOM**: `AdjustBatchDialog` hace
  `if (!canAdjust) return null;` como primera línea. El caso del test **nombra al Operador**, monta
  el panel entero y afirma que el panel se ve y el disparador no existe (`queryBy… === null`), con
  el contraste de que con el permiso sí aparece.

### El motivo, y la trampa de R9 que casi se cobra una pieza

Ni el historial ni el diálogo escriben un mapa de etiquetas por motivo: la etiqueta se **deriva del
propio código** (`movementReasonLabel`: guion bajo → espacio, primera en mayúscula) y las opciones
del selector se recorren desde `MOVEMENT_REASONS`. Dos motivos entrecomillados en un archivo de
`app/` habrían puesto roja la guardia de R9 (`movement-reason.test.ts`), y —más importante— un mapa
por motivo habría hecho falso lo que R9 promete: **añadir un motivo no obliga a tocar la UI**.
**Coste declarado:** la etiqueta derivada sale **sin tilde** («Conteo fisico», «Error de carga»).
Es copy visible, y se acepta a cambio de no tener una lista paralela que mantener.

### BLOQUEANTE de la tanda 5 — de dónde sale `canAdjust`. **Medido, no supuesto.**

El hilo está tendido: `ProductListSection → ProductTable → ProductBatchesSheet → AdjustBatchDialog`
transportan `canAdjust?: boolean`, con defecto **`false`** (falla cerrado). **Lo que falta es quién
lo pone a `true`**, y no se puede resolver dentro de la ruta:

```
$ # mutación: `const sessionUser = await identity.getSessionUser();` en product-list-section.tsx
$ pnpm exec vitest run tests/unit/inventario/product-route-contract.test.ts
  × la pantalla no repite requireAdmin ni decide autorizacion
  AssertionError: app/(private)/inventario/components/product-list-section.tsx
    no debe contener «getSessionUser»
  Test Files  1 failed (1) · Tests  1 failed | 17 passed (18)
```

Revertida la mutación, el archivo vuelve a ser idéntico a `HEAD` y el test da 18/18. Es la **séptima
guardia heredada** que esta ficha se encuentra, y **no se ha tocado**: es de QC-22 y la decisión es
del leader. Las tres salidas posibles, con su coste medido:

| Opción | Qué implica | Coste |
|---|---|---|
| **A. Acotar/enmendar el caso de QC-22** | Permitir la lectura de sesión en la ruta **solo para presentación**, con nota fechada y prueba por mutación. Es lo que ya hacen `usuarios` (QC-75 R6) y `pedidos` | Séptima guardia tocada. La prohibición se debilita para esta ruta |
| **B. `hasPagePermission` en `identity/adapters/driving/`** | La ruta pregunta sin nombrar la sesión; la guardia de QC-22 queda **intacta** | Toca archivo/carpeta de otra ficha; `require-page-permission.ts` tiene test de fuente propio y deja escrito que devuelve `void` **a propósito** |
| **C. Dejarlo en `false`** | Nada rojo, nada tocado | **La pantalla nunca ofrece el ajuste, ni al Administrador**, y el E2E de T16 no puede pasar |

Hoy el árbol está en **C**, que es lo que mantiene el gate verde sin decidir nada. **T13 queda
`[ ]`** por eso: su código está completo y verde, pero su propósito —que desde el listado se pueda
ajustar— no se cumple hasta que el origen del booleano esté decidido. **No me autoapruebo esto.**

### Desviaciones declaradas

1. **`ProductBatchesSheet` vive DENTRO de `product-table.tsx`**, no en un archivo propio. La lista de
   archivos de T13 no incluye ningún componente nuevo, y un archivo suelto en `components/` habría
   exigido además su línea de barrel. Es un componente local de ~60 líneas, no exportado.
2. **Se tocó `tests/unit/inventario/product-page.test.tsx`, que no estaba en la lista de T13.**
   Medido por el subagente y **vuelto a medir aquí**: la página monta `product-table.tsx`, que ahora
   arrastra `batch-actions.ts` (`'use server'`), y ese módulo importa `observabilidad` de
   `@/lib/composition`, que el doble de ese archivo no declaraba → reventaba **al importar**. Con
   `git show HEAD:` de los tres archivos de producción el test daba 59/59; restaurados, rojo. Se
   añadió el **mismo patrón de doble** que el archivo ya usa para `product-actions` y
   `unit-actions`. **Ningún caso existente se debilitó.**
3. **`tests/unit/inventario/product-batches-sheet.test.tsx` es un archivo nuevo no listado en T13.**
   T13 solo listaba el test de contrato de la ruta, que no observa DOM; sin este archivo, «el listado
   abre el panel» no tendría ninguna prueba. El test de contrato **no se tocó**.
4. **`movementReasonLabel` se exporta desde `batch-history.tsx`** y el diálogo lo importa de ahí. Es
   un helper de presentación compartido por dos componentes de la misma ruta; no se creó un archivo
   nuevo para él porque no estaba en ninguna lista de archivos.
5. **Pulido posterior a las tres tasks**, en los mismos seis archivos: se quitó **una** cita de
   requisitos que se había colado en un comentario de producción de `adjust-batch-dialog.tsx`
   —`docs/conventions.md` lo prohíbe y esta ficha ya pagó eso en `934fe7c`—; se arregló un
   `aria-describedby` que apuntaba a un `data-testid` y no a un `id` (no anunciaba nada); el motivo
   pasó a exigirse **también en el cliente**; y los tres datos del lote y del asiento ganaron
   **rótulo visible** («Lote», «Cantidad», «Fecha de compra» / «Motivo», «Autor», «Fecha»), que antes
   eran valores sueltos sin decir qué eran.

### Salida real del gate

`./init.sh --rapido`:

```
[test:rapido] tests relacionados con 43 archivo(s) del diff vs origin/dev
  Test Files  352 passed (352)
       Tests  5235 passed | 26 skipped (5261)
[test:rapido] todas las guardias
  Test Files  43 passed (43)
       Tests  515 passed | 9 skipped (524)
✓ test:rapido paso · ✓ todas las migraciones tienen down.sql · ✓ .env presente · == init OK ==
```

**Y, sabiendo que la selección del modo rápido tiene agujeros** (deuda anotada en la tanda 4), la
carpeta entera corrida **a mano**:

```
pnpm exec vitest run tests/unit/inventario/
  Test Files  47 passed (47)
       Tests  716 passed | 5 skipped (721)
```

`pnpm run typecheck` y `pnpm run lint`: verdes, sin salida. **Cero rojos; ninguno que declarar como
ajeno.** `package.json` no cambió (R33).

---

## T13bis — ENMIENDA AL SPEC del 2026-09-18: el retensado de la guardia de QC-22, y **T13 cierra**

**Aprobada por el humano el 2026-09-18** (opción A de las tres que escaló la tanda 5), escrita como
task propia en `tasks.md` —una enmienda aprobada vive en el spec, no solo aquí; mismo trámite que
T9bis—. **Séptima guardia heredada** que toca esta ficha.

Antes de aprobar, el humano **verificó las tres afirmaciones** en las que se apoyaba la escalada:
el precedente de `pedidos` (`order-list-section.tsx:122`), lo que dice la guardia
(`product-route-contract.test.ts:316`) y el corte del caso de uso
(`adjust-batch-stock.ts:51`, antes de zod). Las tres ciertas.

### El razonamiento aprobado (y va escrito en la nota de la guardia)

La premisa de QC-22 **sigue en pie** —la pantalla no decide autorización—, pero **preguntar si se
pinta un control no es decidir autorización**. La autorización dura la da el caso de uso y rechaza
igual aunque la pantalla se la saltara: **la pantalla no es la regla, es su reflejo**. Es la misma
distinción que `app/(private)/pedidos/components/order-list-section.tsx` ya dejó escrita («No es
autorizacion, es PRESENTACION»), y se **cita**, no se copia de tapadillo.

### Qué cambió, exactamente

**Sigue prohibido, intacto:** `requireAdmin`, `ADMIN_ROLE_NAME`, `decideRouteAccess`, `redirect(`,
`next/headers`. Todo lo que sería **cortar el paso** desde la pantalla.

**Se permite, acotado:** `getSessionUser` sale de la lista dura y pasa a ser condicional. Para
**cada** archivo de la ruta que lo contenga, la guardia exige que (1) no sea de cliente, (2) importe
y use `canAdjustBatchStock` de `@/lib/modules/inventario`, (3) **no hurgue por su cuenta** en el
conjunto de permisos ni en el rol (`.permissions`, `roleName`), y (4) no traiga ningún prohibido
duro. El predicado es `canAdjustBatchStock` (`lib/modules/inventario/domain/actor.ts`), **calcado de
`canModifyAssignments`**: delega en `assertPermission` —la única implementación de la regla—, **no
lanza** y devuelve `false` con la sesión caída.

### La marca POSITIVA: el retensado deja el repo **mejor protegido que antes**

Dos casos **nuevos**, que antes no existían:

1. **`'inventario.modificar'` no vive en la ruta**, en ninguna de sus tres comillas. La respuesta
   sale del módulo; la cadena, no.
2. **El caso de uso conserva su corte en la PRIMERA línea.** Se extrae el cuerpo de la función
   interna `adjustBatchStock` —con un extractor propio, porque el `cuerpoDeFuncion` de
   `qc91-alcance.test.ts` exige `export` y esta función no lo es— y se mide **orden, no presencia**:
   `requirePermission(actor, 'inventario.modificar')` tiene que ser la primera sentencia, antes de
   `safeParse` y antes de cualquier `deps.products.`.

**La mordida, medida por mí y no de oídas.** Borré a mano esa línea de
`lib/modules/inventario/domain/adjust-batch-stock.ts` y corrí la guardia:

```
× el caso de uso de ajuste exige el permiso ANTES de validar y ANTES de tocar el repositorio
AssertionError: expected false to be true
Tests  1 failed | 22 passed (23)
```

Restaurada con `git checkout --`, `git status --porcelain` sin diff y la línea de vuelta en `:51`.
**Antes de esta enmienda, borrar esa línea no ponía roja ninguna guardia de esta ruta.**

**Prueba por mutación, las dos caras, con fuentes fabricadas** y **reusando los mismos detectores**
que el caso real: lectura de sesión sin el predicado ⇒ rojo; con `requireAdmin` ⇒ rojo; con
`redirect(` ⇒ rojo; en un archivo de cliente ⇒ rojo; delegando **y además** hurgando en
`.permissions` ⇒ rojo; delegando de verdad ⇒ verde. Y el corte: en primera línea ⇒ verde; borrado
⇒ rojo; movido tras el `safeParse` ⇒ rojo.

**Límites respetados:** `ningunArchivoContiene`, `FUENTES_DE_LA_RUTA`, `FUENTES_VIGILADAS` y
`fuenteSinComentarios` **sin una línea tocada**; ningún símbolo renombrado para esquivar; ningún
otro caso del archivo debilitado.

### T13 cierra: `canAdjust` ya tiene origen

`product-list-section.tsx` (Server Component) resuelve
`canAdjustBatchStock(await identity.getSessionUser())` y se lo pasa a `ProductTable`. **Se retiró el
prop `canAdjust` de `ProductListSectionProps`**: nadie lo emitía —`page.tsx` nunca lo pasaba—, así
que era letra muerta que garantizaba el `false`. La lectura **no añade consulta**:
`identity.getSessionUser` está memoizada por petición (`requestScoped` en `lib/composition`), que es
la misma vía por la que `requirePagePermission` ya la resolvió; no se montó ningún
`runInRequestScope` nuevo. **T13 y T13bis marcadas `[x]`.**

### Desviaciones de esta tanda

1. **Se ajustó el JSDoc de R5 de `product-list-section.tsx`**, que decía «no se lee la sesion» y
   había dejado de ser cierto. Un comentario con la razón equivocada es peor que ninguno.
2. **`tests/unit/inventario/product-page.test.tsx` NO se tocó**, aunque estaba autorizado: se midió
   que no lo necesitaba —`identity` ya estaba doblado ahí—.
3. **Pulido posterior al primer intento**, en el propio archivo de la guardia: se quitaron las citas
   de ficha que se habían colado en los comentarios nuevos (`docs/conventions.md:31` rige igual en
   tests: el `R<n>` va en el nombre del caso, no en la prosa; **las citas preexistentes no se
   arrastran**); se quitó un `expect(archivosConSesion).toBeGreaterThanOrEqual(0)` que era **siempre
   cierto** y no afirmaba nada (`docs/verification.md > Qué NO cuenta`), sin sustituirlo por uno que
   fijara el estado del árbol; y se cerró el hueco del detector, que daba verde a un archivo que
   delegara en el predicado **y además** hurgara en `.permissions`.

### Salida real del gate

```
./init.sh --rapido
[test:rapido] tests relacionados con 54 archivo(s) del diff vs origin/dev
  Test Files  352 passed (352)
       Tests  5244 passed | 26 skipped (5270)
[test:rapido] todas las guardias
  Test Files  43 passed (43)
       Tests  515 passed | 9 skipped (524)
✓ test:rapido paso · ✓ todas las migraciones tienen down.sql · ✓ .env presente · == init OK ==
```

A mano, porque la selección del rápido tiene agujeros conocidos:

```
pnpm exec vitest run tests/unit/inventario/
  Test Files  47 passed (47)
       Tests  725 passed | 5 skipped (730)
```

`typecheck` y `lint` verdes. **Cero rojos.**

---

## Tanda 6 — T14 y T15: el libro y el `stock` no se separan. **Las dos, porque D12 exige las dos**

Censo de **fuentes** y cuadre de **datos** son complementarios y ninguno solo responde a D12: la
guardia no ve si el asiento lleva la `tx` y el delta correctos; el cuadre no ve un lote anterior al
corte al que un camino futuro le olvide el asiento.

### T14 — `tests/guards/guard-libro-de-inventario.test.ts`

**En `tests/guards/` y no en `tests/unit/`, deliberadamente**, y el nombre empieza por `guard-`:
barre `lib/` como **texto**, así que ningún grafo de imports la relaciona con un cambio y solo la ve
el bloque de guardias, que el gate corre **siempre**. Es la lección que esta ficha ya pagó con
`tests/unit/inventario/schema/inventario-schema.test.ts` —cuatro rojos invisibles durante tres
tandas—; no se repite el patrón.

Afirma **en positivo**: el censo de caminos de escritura de `product_batches` bajo `lib/` es
**exactamente** `{ createWithFirstBatch, addBatchToAlive, adjustBatchStock }` —comparado con
`toEqual`, no con `toContain`, y etiquetando cada hallazgo como `archivo::funcion`—, y el **cuerpo de
cada uno** contiene `writeMovement(`. Autoprueba de vacuidad: si el recorrido no encuentra fuentes o
el lector no encuentra un cuerpo, la guardia se pone **roja**, no muda. Detectores probados con
fuentes fabricadas: un cuarto camino, un `update` fuera de toda función exportada, un camino sin su
asiento, y el `writeMovement` **movido a otra función** —que no cuenta como asiento del camino
pedido—.

**La mordida, medida por mí sobre el árbol real** (no solo sobre fuentes fabricadas): quité a mano el
`writeMovement` del alta de `createWithFirstBatch` en `product-prisma.ts`:

```
× el camino createWithFirstBatch de product-prisma.ts asienta con writeMovement(
AssertionError: …product-prisma.ts :: createWithFirstBatch no contiene una llamada a writeMovement(
  dentro de su cuerpo …: cambia la existencia de un lote sin dejar su asiento.
Tests  1 failed | 12 passed (13)
```

Restaurado con `git checkout --`; `git status --porcelain` sin diff sobre ese archivo y los tres
`writeMovement` de vuelta.

En su cabecera queda escrito **lo que esta guardia NO puede ver**, para que nadie la sobreestime:
que `writeMovement` se llame con la `tx` correcta y con el mismo delta que el `UPDATE`. Eso es del
cuadre, no de ella.

### T15 — `tests/integration/inventario/ledger-cuadre.int.test.ts`

Para todo lote con `created_at >= LEDGER_START` —importado de `movement-ledger.ts`, **no reescrito a
mano**—, `stock` = suma de sus asientos. Cinco casos: alta de producto nuevo, lote añadido a producto
vivo, lote ajustado (suma y resta), **descuadre por SQL crudo sin asiento** —que el cuadre **detecta**,
y es lo que demuestra que el test sirve y no solo mira datos que él mismo acaba de escribir bien— y
la excepción.

**La excepción, escrita en el propio test y no en un JSON:** los lotes anteriores a `LEDGER_START`
quedan fuera **de forma permanente**, con su razón —el libro empieza ahí y no hay asientos
retroactivos— y con la frase de que **a esos los cubre la guardia de T14, no este test**.

**Y el corte es la FECHA, no «cero asientos»**, que es donde estaba el agujero: el último caso
fabrica el **mismo** lote sin asientos a los dos lados del corte —antes: pasa; después: el cuadre lo
caza—. Si la regla fuera «sin asientos, exceptuado», el segundo pasaría en silencio.

**Aislamiento:** fila en la lista **`commit`** de `tests/integration/aislamiento.json`, con `motivo` y
`desde` —esa categoría sí los admite; la de `transaccion` no, como midió la tanda 1—. La razón va
escrita: los tres caminos usan el cliente Prisma **global** y abren cada uno **su propia**
`prisma.$transaction`, así que envolverlos en la transacción del test sería aislamiento de mentira.
Mismo patrón y misma lista que su vecino `product-batch-write.int.test.ts`. Cada caso fabrica su
empresa efímera y limpia en `finally` en orden de FK.

### Salida real del gate

```
./init.sh --rapido
[test:rapido] tests relacionados con 56 archivo(s) del diff vs origin/dev
  Test Files  353 passed (353)
       Tests  5249 passed | 26 skipped (5275)
[test:rapido] todas las guardias
  Test Files  44 passed (44)        <- 43 + la guardia nueva de T14
       Tests  528 passed | 9 skipped (537)
✓ test:rapido paso · ✓ todas las migraciones tienen down.sql · == init OK ==
```

A mano, las dos cosas que el rápido podría no seleccionar:

```
pnpm exec vitest run tests/unit/inventario/
  Test Files  47 passed (47) · Tests  725 passed | 5 skipped (730)

pnpm exec vitest run tests/integration/inventario/ledger-cuadre.int.test.ts
  Test Files  1 passed (1) · Tests  5 passed (5)
```

`typecheck` y `lint` verdes. **Cero rojos; ningún hallazgo:** el cuadre no encontró ningún descuadre
real y el censo no encontró ningún cuarto camino de escritura.

### Desviaciones de la tanda 6

**Ninguna.** Las dos tasks se hicieron con los archivos que listaban, sin tocar producción, ni
migraciones, ni ninguna guardia ajena.

### Estado

**T13bis, T13, T14 y T15 marcadas `[x]`.** Quedan **T16** (E2E a mano, lo coordina el leader) y
**T17** (trazabilidad + gate completo). **Parada aquí, como estaba mandado.**

---

## Tanda 7 — T16 (E2E) y T17 (trazabilidad + gate completo)

**T16 cierra en verde. T17 se paró con un bloqueante escalado y CIERRA después**: el gate completo
terminó en rojo y **dos de los cuatro rojos eran nuestros**, los dos de la misma especie y los dos
fuera de lo que esta ficha podía decidir sola. El mapa de trazabilidad sí está completo, y va abajo.

> **Cómo terminó, y el encuadre correcto** (resolución del 2026-09-18, al final de esta tanda): los
> dos rojos nuestros eran **altas de censo**, no enmiendas, y el humano aprobó darlas de alta. **El
> contador de guardias enmendadas de esta ficha se queda en SIETE**, no sube a nueve. Detalle en
> «RESUELTO — alta de los dos censos». Lo que sigue a continuación es el registro de cómo se midió
> y por qué se paró; se conserva tal cual porque parar era lo correcto.

### Archivos

**Creados**
- `e2e/ajuste-de-inventario.spec.ts` (T16)
- `tests/unit/inventario/schema/inventory-movements-migration.test.ts` — los cinco requisitos que
  T17 encontró sin un solo test (ver «El hallazgo de T17»)
- `progress/e2e_QC-92_template.log`, `progress/e2e_QC-92_chromium.log`, `progress/e2e_QC-92_webkit.log`

**Modificados**
- `progress/impl_QC-92-ajuste-de-inventario.md`, `specs/QC-92-ajuste-de-inventario/tasks.md`

Ningún archivo de producción, ninguna migración, ninguna guardia y **ninguna dependencia**.

### T16 — la base propia, y el aviso de QC-81 sirvió

No se repitió la receta de `specs/QC-77-.../design.md > 3`, que está desfasada y cuyo `db:seed`
muere con «The column 'existe' does not exist» (medido y registrado en
`progress/e2e_QC-93_db-setup.log`). Se siguió la salida de QC-93: **copiar la plantilla ya migrada
y sembrada** que mantiene el propio gate.

```
pnpm run db:test template
  test-db: plantilla reutilizada: qct_tpl_5316b8e32d17 (las migraciones no han cambiado)
  plantilla de esta rama: qct_tpl_5316b8e32d17 (34 migraciones)

DROP DATABASE IF EXISTS "QuimiCloude_QC92" WITH (FORCE)
CREATE DATABASE "QuimiCloude_QC92" TEMPLATE "qct_tpl_5316b8e32d17"
```

Estado de la base recién copiada, medido:

```
companies: 1 · users: 1 · roles: 2 · role_permissions: 17
products: 0 · product_batches: 0 · inventory_movements: 0
_prisma_migrations: 34
```

Las 34 incluyen `20260917130000_inventory_movements`: la base del E2E sale de la **misma receta
mantenida** que usa el gate, no de una armada a mano. El `.env` del worktree se apuntó a esa base
para la corrida y **se restauró** a `QuimiCloude` al terminar (`.env` está en `.gitignore`).

### Salida real del E2E — chromium y webkit, los dos

`progress/e2e_QC-92_chromium.log`:

```
Running 3 tests using 3 workers
  ok quien solo tiene inventario.consultar ve el panel y el historial, pero el control de ajuste no existe en el DOM (20.5s)
  ok un ajuste que dejaria la existencia bajo cero se rechaza y no deja rastro (21.2s)
  ok un ajuste con motivo cambia la cantidad del lote y queda su asiento junto al de alta, en Postgres (22.6s)
  3 passed (42.6s)
```

`progress/e2e_QC-92_webkit.log` (base **recreada desde la plantilla** antes de esta corrida):

```
Running 3 tests using 3 workers
  ok quien solo tiene inventario.consultar ve el panel y el historial, pero el control de ajuste no existe en el DOM (16.8s)
  ok un ajuste que dejaria la existencia bajo cero se rechaza y no deja rastro (19.2s)
  ok un ajuste con motivo cambia la cantidad del lote y queda su asiento junto al de alta, en Postgres (21.0s)
  3 passed (28.1s)
```

**6/6 en los dos motores.** WebKit es el motor de iOS y la regla multiplataforma pide ejercitarlo,
no suponerlo.

**R4 va extremo a extremo, que es lo que pedía la ficha**: el caso lee el `stock` y el conteo de
asientos **antes** —no da por bueno el estado que dejó el caso anterior—, pide un ajuste que dejaría
la existencia negativa, y afirma en pantalla `adjust-batch-error` con el `data-code` de
`batch_stock_negative` y el diálogo todavía abierto; y **contra Postgres**, que ni el `stock` cambió
ni se escribió asiento. El recorrido feliz afirma también contra Postgres: `stock` = inicial + delta
y **exactamente dos** filas en `inventory_movements` para ese lote —la de alta intacta y la de
ajuste con su clase, su cantidad con signo y el motivo elegido—.

**Residuo: cero.** Medido tras las dos corridas sobre `QuimiCloude_QC92`:

```
companies|users|products|presentations|units con prefijo qc92_e2e_: 0
product_batches: 0 · inventory_movements: 0
roles: 2 · role_permissions: 17   <- los del seed, intactos
```

**El Operador del seed sirvió tal cual** y no hizo falta rol efímero: tiene `inventario.consultar`
y no tiene `inventario.modificar` (comprobado en `permissions.ts` antes de escribir el caso, y la
premisa se vuelve a verificar dentro del test con `permissionsForUsername`). Ningún rol del seed se
crea, modifica ni borra.

**Lo que este E2E NO acredita**, escrito para que nadie lo sobreestime: `init.sh` **no** corre
Playwright (deuda conocida, `docs/verification.md`), así que el gate en verde no acredita este
recorrido y este recorrido no acredita el gate. Son dos afirmaciones distintas y las dos hacen falta.

### El hallazgo de T17 — cinco requisitos estaban SIN UN SOLO TEST

Al cruzar los 34 requisitos contra el disco, **R11, R14, R15, R16 y R31 no tenían ningún test que
los afirmara**. No es una impresión: un barrido de `inventory_movements` bajo
`tests/unit/inventario/schema/` no devolvía **nada**. La tabla nueva era la única del módulo sin su
test de migración, mientras sus tres hermanas (`inventario-migration`,
`inventory-company-scope-migration`, `product-batch-lot-migration`) sí lo tienen. El reviewer
rechazó QC-81 por exactamente esto, así que se cierra aquí y no se arrastra.

`tests/unit/inventario/schema/inventory-movements-migration.test.ts`, 9 casos, todos con **prueba
por mutación** de su detector y **autoprueba de vacuidad** (si el lector no encuentra lo que busca,
rojo, no mudo):

| Caso | Cubre |
|---|---|
| `R11: el censo de columnas es exactamente id, batch_id, kind, quantity, reason, company_id, created_by, created_at` | R11 |
| `R14: ni migration.sql ni down.sql contienen un INSERT INTO real, aunque BEFORE INSERT si aparece` | R14 |
| `R14: ninguna otra migracion del repo escribe filas en inventory_movements` | R14 |
| `R15(a): el SQL no ofrece ninguna via de UPDATE ni DELETE, y la tabla nace sin updated_at ni deleted_at` | R15 |
| `R15(b): las unicas operaciones sobre inventoryMovement bajo lib/ son exactamente create y findMany` | R15 |
| `R16: todo identificador creado por la migracion es snake_case en ingles` | R16 |
| `R16: la migracion no anade marca de borrado ni borra filas ni la tabla de product_batches` | R16 |
| `R31: cada objeto creado por el up tiene su DROP correspondiente en el down, ni uno mas ni uno menos` | R31 |
| `R31: el down cae en orden inverso -disparador y funcion primero, la tabla al final-` | R31 |

R15(b) es **censo en positivo**, el mismo patrón que T14: la lista nombrada de operaciones
(`create`, `findMany`), no la ausencia de un patrón. R31 deriva **las dos listas del texto** y las
cruza por correspondencia; no se escriben a mano las dos, que sería copiar el error de un lado al
otro. Un matiz queda escrito en el propio archivo y no disimulado: el detector de R16 valida
**forma** (`snake_case`), no **vocabulario** — un identificador en castellano pero bien formado
pasaría, y la mutación que lo demuestra lleva su comentario explicando por qué sigue verde.

### Mapa R -> test — **34 declarados, 34 mapeados**

Los dos números: **34 requisitos declarados** en `requirements.md` (R1..R34), **34 mapeados**.
Ninguno sin test.

| R | Test que lo afirma |
|---|---|
| R1 | `adjust-batch-stock` «R1: el total lo devuelve el puerto y el caso de uso lo propaga sin recalcular» · `adjust-batch-stock-prisma` «R2, R7: un delta positivo suma sobre lo que la base tenga…» (filtra por id + empresa: un solo lote) · `qc91-alcance` «R11: los tres escritores de producto no escriben products.stock» |
| R2 | `adjust-batch-stock` «R2: un delta negativo llega al puerto tal cual, con su signo» · `adjust-batch-dialog` «un delta negativo conserva su signo: NUNCA el total nuevo del lote» |
| R3 | `adjust-batch-stock` «R3: rechaza {cero, no entero, ausente} sin tocar el repositorio» · `inventory-movements-constraints` «rechaza quantity = 0 con SQLSTATE 23514 (R3)» · `adjust-batch-dialog` «la cantidad cero se rechaza en el cliente» |
| R4 | `adjust-batch-stock-prisma` «R4: el 23514 de product_batches_stock_non_negative se traduce a BatchStockNegativeError» · `batch-actions` «traduce batch_stock_negative con el texto del catalogo» · **E2E** «un ajuste que dejaria la existencia bajo cero se rechaza y no deja rastro» |
| R5 | `inventory-movements-constraints` «rechaza un stock negativo en product_batches por SQL crudo con SQLSTATE 23514 (R5)» · `inventario-schema` «R25, R28: la migracion de product_batches conserva sus dos CHECK y su RLS ENABLE+FORCE sin policies» · `inventory-movements-migration` «R16: la migracion no anade marca de borrado ni borra filas ni la tabla de product_batches» |
| R6 | `adjust-batch-stock-prisma` «R6: si el asiento falla, el ajuste entero se rechaza» · `batch-movement-prisma` «writeMovement (R6, R12) — recibe la tx, no la abre» |
| R7 | `adjust-batch-stock-prisma` «R2, R7: un delta positivo/negativo suma o resta sobre lo que la base tenga» · `qc91-alcance` «R1: product-prisma.ts arma stockByUnit desde los lotes con sumStockByUnit» |
| R8 | `adjust-batch-stock` «R8: rechaza {motivo ausente, fuera del conjunto} sin tocar el repositorio» y «R8: los cuatro motivos del conjunto pasan y llegan tal cual al puerto» · `inventory-movements-constraints` «rechaza el ajuste sin motivo (R10)» · `adjust-batch-dialog` «sin motivo, muestra el mensaje y NO invoca la action» |
| R9 | `movement-reason` «R9 — ninguna fuente bajo app/ ni lib/ enumera los motivos a mano: todo consumidor deriva de la constante», con sus dos casos de mutación |
| R10 | `inventory-movements-constraints` «rechaza el alta CON motivo con SQLSTATE 23514 (R10)» · `adjust-batch-stock-prisma` «createWithFirstBatch escribe el lote y, despues, su asiento de apertura» |
| R11 | **`inventory-movements-migration` «R11: el censo de columnas es exactamente…»** · `inventory-movements-constraints` (inserta con las ocho contra Postgres real) |
| R12 | `adjust-batch-stock-prisma` «R12 — el alta deja su asiento de apertura en la misma transaccion» y «si el asiento falla, la transaccion entera se rechaza» |
| R13 | `guard-libro-de-inventario` «el censo de caminos de escritura es exactamente { createWithFirstBatch, addBatchToAlive, adjustBatchStock }» — censo en positivo: un cuarto camino (consumo) lo pone rojo · `module-contract` «ningun export del contrato denota editar ni borrar lotes» |
| R14 | **`inventory-movements-migration` «R14: ni migration.sql ni down.sql contienen un INSERT INTO real…» y «R14: ninguna otra migracion del repo escribe filas en inventory_movements»** |
| R15 | **`inventory-movements-migration` «R15(a): el SQL no ofrece ninguna via de UPDATE ni DELETE…» y «R15(b): las unicas operaciones sobre inventoryMovement bajo lib/ son exactamente create y findMany»** |
| R16 | **`inventory-movements-migration` «R16: todo identificador creado por la migracion es snake_case en ingles» y «R16: la migracion no anade marca de borrado…»** · `qc91-alcance` «R21: product-prisma.ts no borra, reemplaza en bloque ni multiplica filas de product_batches» |
| R17 | `guard-rls-force` «toda tabla creada tiene RLS activado y forzado» (descubre las tablas del SQL, no de una lista fija) · `inventory-movements-migration` R11 (company_id NOT NULL) y R31 (las tres FK y los tres índices) · `inventory-movements-constraints` «rechaza un asiento cuya empresa no coincide… (R19)» |
| R18 | **`company-scope-queries` (integracion, Postgres real, dos empresas A y B): «adjustBatchStock sobre el lote de B desde A devuelve null y NO toca la fila ni escribe asiento» + su control positivo, «findBatchesOfAliveProduct del producto de B pedido desde A trae la lista vacia» + su control positivo, y «findBatchMovements del lote de B pedido desde A es `null`» + su control positivo** — los seis, y son los que prueban R18 DE VERDAD: el camino de escritura `update({ where: { id, companyId } })` contra la base, no contra un mock · `adjust-batch-stock` «R18: el puerto devuelve null y el caso de uso lanza BatchNotFoundError», «R18: cambiar de actor cambia la empresa que llega al puerto», «R18: el producto inexistente, borrado o ajeno vuelve como lista vacia», «R18: el lote inexistente o ajeno devuelve null…», «R18: el ambito de la lectura sale del actor» (unidad, con Prisma mockeado: demuestran que el codigo PASA la empresa, no que Postgres la honre) · `batch-movement-prisma` «findBatchMovements (R18)» · `batch-actions` «R18 — el actor sale de la sesion del servidor» y «R18 — una empresa colada en el FormData no cambia el actor» · `guard-ambito-empresa-inventario` (los metodos nuevos del puerto declaran y consumen el ambito) |
| R19 | `inventory-movements-constraints` «rechaza un asiento cuya empresa no coincide con la del lote, con el identificador del disparador (R19)» |
| R20 | `adjust-batch-stock` «R20: rechaza sin permiso sin tocar el repositorio» y «R20: el permiso se mira ANTES de zod, incluso con entrada invalida» · `batch-actions` «R20 — el Operador, que solo consulta, recibe el error de autorizacion del ajuste» · `product-route-contract` «el caso de uso de ajuste exige el permiso ANTES de validar y ANTES de tocar el repositorio» |
| R21 | `adjust-batch-stock` «R21: el Operador… SI puede listar los lotes» y «R21: un actor con solo inventario.modificar es rechazado» (x2) · `authorization` «R21 — canAdjustBatchStock» (4 casos, incluida la sesión caída) · `adjust-batch-dialog` «sin canAdjust el panel se ve pero el disparador del ajuste no existe en el DOM» · `product-batches-sheet` «canAdjust decide si el control de ajuste existe en el DOM» · **E2E** «quien solo tiene inventario.consultar ve el panel y el historial, pero el control de ajuste no existe en el DOM» |
| R22 | `product-batches-panel` «pinta tres lotes con numero, cantidad con su unidad derivada (sin convertir) y fecha (R22)» · `product-batches-sheet` «la fila abre el panel de lotes DEL producto (R22)» · **E2E** (recorrido feliz) |
| R23 | `batch-history` «R23 — con asientos, muestra motivo, autor y fecha en el orden en que llegan, alta incluida» · `adjust-batch-stock` «R23: el autor que vuelve del directorio sale con su nombre mostrable» y «R23: el resto del asiento no se toca al resolver el autor» · **E2E** (recorrido feliz) |
| R24 | `batch-history` «R24 — sin ningun asiento, dice que el lote es anterior al libro y no parece un error ni una lista» · `adjust-batch-stock` «R24: el lote sin asientos devuelve lista vacia y NO pregunta al directorio» |
| R25 | `product-batches-panel` «multiplataforma: el disparador de la ranura de acciones cumple el objetivo tactil minimo (R25)» · `adjust-batch-dialog` «multiplataforma (R25): el disparador y los campos llevan area tactil, y el campo de cantidad lleva text-base» |
| R26 | `qc91-alcance` «R21: el alta y el agregado de lote siguen creando; el unico update vive en adjustBatchStock» — la guardia R21 de QC-91 **ajustada**, con su nota fechada 2026-09-17 |
| R27 | `qc91-alcance` «llamaAUpdateFueraDe — el update de adjustBatchStock queda aislado del resto (R27)»: 5 casos sobre fuentes fabricadas —update dentro (verde), el MISMO update movido a otra función (rojo), sin update (sin hallazgo), tipo de retorno con llave propia, y delete/deleteMany/SQL crudo siguen dando hallazgo— |
| R28 | `guard-libro-de-inventario`, 13 casos: el censo en positivo, el asiento en cada camino, y los detectores probados con un cuarto camino fabricado, un camino sin su asiento y el asiento movido a otra función |
| R29 | `ledger-cuadre` «cuadre del libro: stock = suma de asientos, para lotes posteriores a LEDGER_START (R29)», 4 casos, incluido el descuadre por SQL crudo que el cuadre **detecta** |
| R30 | `ledger-cuadre` «la excepcion permanente de los lotes anteriores a LEDGER_START (R30)»: el mismo lote sin asientos a los dos lados del corte —antes pasa, después lo caza— |
| R31 | **`inventory-movements-migration` «R31: cada objeto creado por el up tiene su DROP correspondiente en el down» y «R31: el down cae en orden inverso»** · `init.sh` «todas las migraciones tienen down.sql» · ciclo migrate deploy -> db:rollback -> migrate deploy verificado a mano en la tanda 1 |
| R32 | `catalogo` «QC-92 R32 — los dos codigos del lote de ajuste tienen codigo y texto propios», 3 casos: las 48 entradas, que se distinguen entre sí y de product_not_found / invalid_input, y que la cabecera redacta la séptima enmienda con su fecha y su aprobación |
| R33 | `guard-dependencias-aprobadas` (toda dependencia tiene su fila en el registro) **más la medición directa**: el diff de `package.json`, `pnpm-lock.yaml` y `docs/dependencias.md` contra `origin/dev` sale **vacío** |
| R34 | **`e2e/ajuste-de-inventario.spec.ts`**, 3 casos x 2 motores, corrido a mano y pegado arriba |

### Salida real del gate completo — **ROJO**, con cuatro rojos y los cuatro medidos

`./init.sh` (completo, **sin** `--rapido`), código de salida 1:

```
Test Files  4 failed | 541 passed (545)
     Tests  4 failed | 7943 passed | 97 skipped (8044)
  Duration  433.99s

hay 4 archivo(s) de test en rojo que NO estan en el baseline:
  tests/guards/guard-identificador-de-request.test.ts
  tests/unit/configuracion-ui/user-table.test.tsx
  tests/unit/inventario/scope.test.ts
  tests/unit/pedidos-ui/order-form.test.tsx
hay rojos NUEVOS respecto del baseline
```

`typecheck` y `lint`, **verdes**. Las 45 guardias corren; las dos rojas son **censos**, no defectos
de comportamiento.

**Se esperaba un rojo y salieron cuatro.** Los cuatro medidos, uno a uno, antes de etiquetarlos —en
esta ficha un subagente etiquetó mal un rojo propio dos veces, y las dos lo causaba él—:

**1. `tests/unit/pedidos-ui/order-form.test.tsx` — HEREDADO de `dev`, no nuestro.**
«R14 — sin ningun lote, la existencia es 0 y el restante negativo se destaca como faltante»,
`1 failed | 32 passed (33)`. Espera `-0.201` y recibe `-0.2`. Medición **repetida por mí**, no
heredada de palabra: los cuatro archivos implicados son **byte a byte idénticos a `origin/dev`**
(`git diff --quiet origin/dev -- <archivo>` sale 0 en `tests/unit/pedidos-ui/order-form.test.tsx`,
`app/(private)/pedidos/components/order-decimal.ts`, `order-form.tsx` y
`order-ingredients-table.tsx`), y el diff de rama contra `origin/dev` sobre `tests/unit/pedidos-ui/`,
`app/(private)/pedidos/` y `lib/modules/pedidos/` sale **vacío**: esta rama no toca un solo archivo
de pedidos. Causa: el PR #85 (redondeo a dos decimales) cruzado con el caso R14 de QC-91, que espera
tres. **Es de `dev`. No se arregla aquí** —está fuera del alcance de esta ficha— y no se declara
como nuestro.

**2. `tests/unit/configuracion-ui/user-table.test.tsx` — FLAKE DE SATURACIÓN, no nuestro.**
«la accion de editar de una fila abre el panel SOBRE ESE usuario (R26)», un `findByTestId` que
expira. Medido, no supuesto, con las dos comprobaciones que pide `docs/verification.md`:
- **aislado pasa**: `pnpm exec vitest run tests/unit/configuracion-ui/user-table.test.tsx` →
  `Test Files 1 passed (1) · Tests 27 passed (27)`;
- **la rama no lo toca**: el diff contra `origin/dev` sobre `tests/unit/configuracion-ui/`,
  `app/(private)/configuracion/` y `lib/modules/identity/` sale **vacío**.
Es la especie que documenta QC-58 y que `docs/verification.md` describe: 2–5 flakes por corrida que
cambian de sitio. **No está en el baseline**, así que el comparador lo cuenta igual.

**3 y 4. `guard-identificador-de-request.test.ts` y `tests/unit/inventario/scope.test.ts` —
NUESTROS, los dos, y son la MISMA especie.** No se disimulan: los causa el archivo que T16 acaba de
crear. Ver el bloqueante de abajo, con su prueba por mutación.

### BLOQUEANTE de T17 (parada del 2026-09-18) — dos censos rotos. No se tocan; se escalan.

> **RESUELTO el mismo día**, ver la sección final. Y **el encuadre de esta sección era el
> equivocado**: se leyeron como «la octava y la novena guardia» cuando **no lo son**. Se conserva
> el texto tal cual, con la corrección marcada abajo, porque el error de encuadre es parte de lo
> que hay que poder auditar.

Los dos rojos nuestros son **censos cerrados de archivos bajo `e2e/`** que se ponen rojos porque
existe un spec nuevo. Ninguno de los dos habla del ajuste de inventario; los dos hablan de otra
ficha:

| Archivo | Lista | Mensaje |
|---|---|---|
| `tests/guards/guard-identificador-de-request.test.ts:576` | `E2E_ESPERADOS` (de QC-71) | `e2e/ajuste-de-inventario.spec.ts: archivo nuevo en e2e/. QC-71 difirio el E2E con motivo (R21)…` |
| `tests/unit/inventario/scope.test.ts:337` | lista cerrada de specs de catálogo (de QC-20/QC-22) | `spec E2E de catalogo inesperado: aislamiento-inventario.spec.ts, ajuste-de-inventario.spec.ts, inventario.spec.ts` |

**Prueba por mutación, hecha por mí, que deja fuera de duda de quién son y que no hay nada más
detrás**:

```
# con el spec nuevo MOVIDO fuera del árbol, sin tocar nada más:
pnpm exec vitest run tests/guards/guard-identificador-de-request.test.ts tests/unit/inventario/scope.test.ts
  Test Files  2 passed (2) · Tests  27 passed (27)

# con el spec nuevo restaurado, sin tocar nada más:
  Test Files  2 failed (2) · Tests  2 failed | 25 passed (27)
```

Los causa **exclusivamente** la existencia del archivo. Son nuestros y se declaran nuestros.

**Por qué paro aquí y no los doy de alta**: la instrucción de esta ficha es explícita — siete
guardias heredadas ya tocadas, todas con aprobación humana, nota fechada y prueba por mutación, y
**si aparece una octava, parar y reportarla con la medición**. No se renombra nada para esquivar,
no se toca ningún detector y no se afloja ningún matcher.

> **CORRECCIÓN del 2026-09-18** (leader, con el humano): parar estuvo bien, **pero contarlas como
> «la octava y la novena» estuvo mal**. Las siete anteriores **cambiaban lo que la guardia afirma**,
> y por eso cada una necesitó decisión humana. Estas dos **no cambian nada de lo que la guardia
> afirma**: son el **trámite que la propia guardia pide** para registrar un archivo nuevo.
> **El contador de guardias enmendadas de esta ficha se queda en SIETE.**

**Lo que haría falta, para que el leader decida con el dato delante**: las dos listas dicen en su
propio comentario que **su punto de extensión por diseño es darse de alta en ellas**.
`E2E_ESPERADOS` ya lo hicieron QC-49, QC-67, QC-79, QC-85, QC-101 y QC-102 —seis fichas, cada una
con su nota fechada diciendo que su spec **no** ejercita el cruce borde→acción del identificador de
petición—; y `scope.test.ts` lo escribe literalmente: «La guardia no se afloja; se le añade un
renglón», con el razonamiento de por qué se enumera en vez de afinar el matcher por nombre. En los
dos casos el trámite sería **un renglón con su nota fechada**, no relajar la regla. Pero es una
guardia heredada que esta ficha no había tocado, y **la decide el humano, no yo**.

Para las dos, la nota sería del mismo tipo que las que ya están: `ajuste-de-inventario.spec.ts`
**no** lee ni afirma nada sobre el identificador de petición ni sobre `reference` —así que el
diferimiento de QC-71 R21 seguiría intacto—, y **no es una segunda pantalla del catálogo**: casa
con el patrón por la palabra «inventario», igual que `aislamiento-inventario.spec.ts`, pero lo que
ejercita es el **panel de lotes y el ajuste**, que es pantalla de esta ficha.

**Dato para QC-99**: un solo archivo, `guard-identificador-de-request.test.ts`, lleva **dos** listas
cerradas independientes —migraciones y specs de E2E— y **esta ficha las ha roto las dos**, en dos
tandas distintas (T1 y T16) y por dos motivos que no tienen nada que ver entre sí ni con el
identificador de petición. Es la tercera familia (censo) ya inventariada en esta bitácora, y aquí se
ve que un mismo archivo puede cobrártela más de una vez.

### CHECKPOINTS.md, recorrido entero

- Trazabilidad: **34/34**, arriba. OK
- `typecheck`, `lint`: verdes. OK
- `pnpm test`: **rojo**, 4 archivos; los cuatro medidos y clasificados arriba. **BLOQUEANTE**
- E2E de flujo crítico (movimiento de inventario): **existe y pasa**, chromium + webkit. OK
- Multiplataforma (`dvh`, sin `:hover` como única vía, 44x44, 16 px): R25, con test. OK
- Dependencias: **ninguna nueva**, medido contra `origin/dev`. OK
- Empresa, RLS ENABLE+FORCE sin policies, permiso en el **service**: R17, R19, R20, con test. OK
- Migración con `down.sql` y `db:rollback` coherente: R31, con test y con el ciclo verificado. OK
- `./init.sh` en verde: **NO**. **BLOQUEANTE**

### Desviaciones de la tanda 7

1. **Se creó un archivo de test que T17 no listaba**, `inventory-movements-migration.test.ts`. T17
   listaba solo la bitácora y `tasks.md`, pero su encargo es **cerrar la trazabilidad de las 34** y
   cinco requisitos no tenían test. Escribirlos en el mapa sin test habría sido un mapa falso.
2. **Las dos listas cerradas quedan rotas y sin arreglar**, a propósito (bloqueante de arriba). El
   gate queda rojo por ello, y se declara en vez de esconderse.
3. **El E2E se corrió contra una base propia** (`QuimiCloude_QC92`) y no contra la de desarrollo,
   siguiendo lo que hizo QC-93. El `.env` se restauró al terminar.

### Estado

**T16 `[x]`.** **T17 `[ ]`**: el mapa de trazabilidad está completo (34/34) y el gate completo se
corrió de verdad, pero **termina en rojo** y dos de los cuatro rojos son nuestros y están escalados.
**Parada aquí. No se abre el PR.**

---

## RESUELTO — alta de los dos censos, y **T17 CIERRA** (2026-09-18)

**Aprobado por el humano el 2026-09-18**, con el leader verificando antes las dos afirmaciones de
la parada: `E2E_ESPERADOS` dice en su propio comentario que «esta lista es CERRADA y su punto de
extension por diseno es darse de alta en ella. El ancla NO se relaja -el archivo se nombra, uno a
uno-», con **seis altas previas** (QC-49, QC-67, QC-79, QC-85, QC-101, QC-102); y el rojo de
`scope.test.ts` es el de su lista cerrada de specs E2E de catálogo.

### El encuadre, que es lo que hay que retener

**NO son la octava y la novena enmienda de guardia.** La distinción es la que importa y va escrita
para que no se pierda:

- **Las siete anteriores cambiaban lo que la guardia AFIRMA.** Por eso cada una necesitó decisión
  humana, nota fechada y prueba por mutación de las dos caras: después de tocarlas, la guardia
  afirmaba algo distinto de lo que afirmaba antes.
- **Estas dos no cambian NADA de lo que la guardia afirma.** Son el **trámite que la propia guardia
  pide** para registrar un archivo nuevo. Registrar el spec es **usar la guardia como fue
  diseñada**; **no** registrarlo dejaría el E2E **fuera del censo**, que es estrictamente peor.

**Por eso el contador de esta ficha se queda en SIETE guardias enmendadas, no sube a nueve.** Estas
dos van aparte, como **altas de censo**. Parar y preguntar fue lo correcto —la instrucción era
esa—; contarlas como enmiendas, no.

### Lo que se escribió

Un renglón en cada lista, **con nota fechada 2026-09-18**, en el sitio y con la forma de las altas
previas. El diff es **puramente aditivo: 21 inserciones, 0 borrados**. No se relajó ningún ancla, no
se tocó ningún detector, no se amplió ningún patrón, no se renombró nada, y el bloque de «Defensa
extra» de `scope.test.ts` —el que comprueba que `aislamiento-inventario.spec.ts` sigue llevando sus
señales— **quedó intacto**.

- `tests/guards/guard-identificador-de-request.test.ts` → `'ajuste-de-inventario.spec.ts'` en
  `E2E_ESPERADOS`, con la nota que dice **qué recorrido ejercita** el spec y que **NO** ejercita el
  cruce borde→acción del identificador de petición —no lee ni afirma nada sobre el identificador ni
  sobre `reference`—, **así que el diferimiento de QC-71 R21 sigue declarado INTACTO**.
- `tests/unit/inventario/scope.test.ts` → el tercer nombre en la lista cerrada, en el orden que
  devuelve el matcher (alfabético), con la nota de por qué **no es una segunda pantalla del
  catálogo**: casa con `screenPattern` por la palabra «inventario», igual que
  `aislamiento-inventario.spec.ts`, pero lo que ejercita es el **panel de lotes y el ajuste**, que
  es la pantalla que añade esta ficha; el alta del catálogo la sigue cubriendo `inventario.spec.ts`,
  que no se toca.

### Prueba por mutación — las dos listas, las dos caras

`pnpm exec vitest run tests/guards/guard-identificador-de-request.test.ts tests/unit/inventario/scope.test.ts`

**Con los dos renglones puestos** → verde: `Test Files 2 passed (2) · Tests 27 passed (27)`.

**Quitando SOLO el renglón de `E2E_ESPERADOS`** → rojo:

```
× no hay ningun archivo nuevo en e2e/ y existe el test que lo sustituye (R21)
AssertionError: expected [ Array(1) ] to deeply equal []
+ [
+   "e2e/ajuste-de-inventario.spec.ts: archivo nuevo en e2e/. QC-71 difirio el E2E con motivo (R21):
+    el cruce borde -> accion se prueba en tests/unit/identity/route-guard-request-id.test.ts.
+    Si de verdad hace falta un E2E, es otra ficha y otra decision.",
+ ]
Test Files  1 failed | 1 passed (2) · Tests  1 failed | 26 passed (27)
```

**Quitando SOLO el renglón de `scope.test.ts`** → rojo:

```
× la pantalla del catalogo vive solo donde la declara QC-22, y en ningun otro sitio
AssertionError: spec E2E de catalogo inesperado: aislamiento-inventario.spec.ts,
ajuste-de-inventario.spec.ts, inventario.spec.ts: expected [ …(3) ] to deeply equal [ …(2) ]
    "aislamiento-inventario.spec.ts",
+   "ajuste-de-inventario.spec.ts",
    "inventario.spec.ts",
```

**Restaurados los dos** → verde otra vez: `Test Files 2 passed (2) · Tests 27 passed (27)`.

Las dos listas **siguen mordiendo**: quitar el renglón las pone rojas. No se han apagado, se han
completado.

### Gate completo, re-corrido tras el alta — **UN SOLO ROJO, y es el heredado**

`./init.sh` (completo, **sin** `--rapido`), código de salida 1:

```
Test Files  1 failed | 544 passed (545)
     Tests  1 failed | 7946 passed | 97 skipped (8044)
  Duration  277.85s

hay 1 archivo(s) de test en rojo que NO estan en el baseline:
  tests/unit/pedidos-ui/order-form.test.tsx
```

`typecheck` y `lint`, **verdes**. Las 45 guardias, verdes
(`Test Files 45 passed (45) · Tests 557 passed | 9 skipped (566)`).

**Es exactamente lo esperado y ni uno más.** Comparado con la corrida anterior (4 rojos):

- **Los dos nuestros desaparecieron**: los dos censos, ya dados de alta, pasan. De 541 a **544**
  archivos en verde.
- **`configuracion-ui/user-table.test.tsx` NO volvió a salir.** Queda **confirmado por segunda vía**
  lo que ya se había medido: era el **flake de saturación**, no una regresión. La primera medición
  (pasa aislado 27/27 + diff de rama vacío sobre `configuracion-ui/`, `app/(private)/configuracion/`
  y `lib/modules/identity/`) y esta segunda corrida dicen lo mismo. Es la especie de QC-58 que
  `docs/verification.md` describe: 2–5 flakes por corrida que **cambian de sitio**, y por eso el
  comparador va por archivo y no por conteo.
- **Queda el único rojo heredado**: `tests/unit/pedidos-ui/order-form.test.tsx`, «R14 — sin ningun
  lote, la existencia es 0 y el restante negativo se destaca como faltante». Espera `-0.201`,
  recibe `-0.2`. **Es deuda de `dev`**: los cuatro archivos implicados son byte a byte idénticos a
  `origin/dev` y esta rama no toca un solo archivo de pedidos (las dos mediciones, arriba). Causa:
  el PR #85 (redondeo a dos decimales) cruzado con el caso R14 de QC-91, que espera tres.

**`tests/baseline-rojos.json` NO se toca**, y es deliberado: la entrada le corresponde a quien
arregle la deuda en `dev`, no a esta ficha. Se declara aquí y va al PR.

**Ningún tercer rojo apareció**, así que no hubo nada que medir contra `origin/dev`.

### Estado final

**T16 `[x]` · T17 `[x]`.** Las **20 tasks** de la ficha —T0..T17 más T9bis y T13bis—, todas `[x]`.
Contado sobre el archivo: 20 marcadas, **ninguna sin marcar**.

- Trazabilidad **34/34**, con los cinco requisitos que no tenían test ya cubiertos.
- E2E a mano, **6/6**, chromium y webkit, con su salida pegada.
- Gate completo corrido: **un solo rojo, heredado de `dev` y medido**.
- **Siete guardias enmendadas** en toda la ficha —ese contador no se movió— más **dos altas de
  censo**, que es otra cosa.
- Cero dependencias nuevas.

**No se abre el PR**: lo coordina el leader tras el `reviewer`.

---

## Vuelta de review (2026-09-18) — los TRES bloqueantes del reviewer, cerrados

Informe: `progress/review_QC-92-ajuste-de-inventario.md`. Veredicto: **RECHAZADO**, tres
bloqueantes, ninguno en el bloque de las guardias heredadas. Los tres eran **ciertos** y los tres
se verificaron en disco antes de tocar nada. **Los ocho menores NO se tocan en esta vuelta**: los
decide el leader.

### B1 — faltaba el rechazo cruzado contra Postgres real. CERRADO (`88432f2`)

**El bloqueante serio, y es de seguridad de datos.** `tests/integration/inventario/company-scope-queries.int.test.ts`
es el archivo A/B que este repo usa exactamente para esto —dos empresas reales, cada escritura
cruzada con **su control positivo**—, y la rama lo había tocado **solo** para añadir una línea de
limpieza de FK. Medido: **cero casos** para `adjustBatchStock`, `findBatchesOfAliveProduct` y
`findBatchMovements`. La única aparición de `adjustBatchStock` en integración era `ledger-cuadre`,
**con una sola empresa**.

Lo que quedaba sin probar era el camino de **ESCRITURA**: `tx.productBatch.update({ where: { id,
companyId } })`. `companyId` **no es columna única**, así que que Prisma lo honre dentro del `where`
de un `update` depende de su semántica, no de un `AND` que se lea en el SQL. Un mock demuestra que
el código **pasa** la empresa, no que Postgres la **respete**. Sin ese filtro, **un ajuste
escribiría en el lote de otra empresa**: `CHECKPOINTS.md > Datos y seguridad` y
`docs/architecture.md > Dominio` n.º 1.

**Seis casos nuevos**, con el patrón de sus vecinos de R16 —no uno inventado— y control positivo en
cada uno:

| Caso | Qué afirma contra la base |
|---|---|
| `adjustBatchStock` sobre el lote de B **desde A** | `null`, la fila de B releída **entera** (foto de todas las columnas, no solo `stock`: un `updated_at` movido no pasa) **sin cambiar**, y **cero** asientos nuevos en `inventory_movements` |
| control positivo, **desde B** | `{ stock }` con el total esperado, la fila **sí** cambia y queda **exactamente un** asiento nuevo con su `kind` (`adjustment`), su `quantity` con signo, su `reason` y su `company_id` |
| `findBatchesOfAliveProduct` del producto de B **desde A** | lista vacía |
| control positivo, **desde B** | trae su lote |
| `findBatchMovements` del lote de B **desde A** | `null` |
| control positivo, **desde B** | no es `null` y trae el asiento que dejó el control positivo de arriba (dependencia de orden **declarada en el propio test**) |

**Los tres cruzados distinguen, medido y no supuesto.** Cambiando en cada uno el ámbito cruzado por
el propio, los tres se ponen rojos —y esta medición la repitió el implementer, no solo el subagente:

```
AssertionError: expected { stock: 8 } to be null
AssertionError: expected [ { …(6) } ] to deeply equal []
AssertionError: expected [ { …(6) } ] to be null
```

Mutaciones revertidas; el archivo vuelve a **34 passed (34)**.

**Salida real**, contra base real —copia de la plantilla ya migrada con `CREATE DATABASE …
TEMPLATE`, la receta de T16 y la que mantiene el propio gate, **no** la desfasada de QC-77—:

```
test-db: plantilla reutilizada: qct_tpl_5316b8e32d17 (las migraciones no han cambiado)
test-db: la corrida de integracion va contra qct_qc92_d05e0ce0_mu75ux55_kk0 (copia de qct_tpl_5316b8e32d17).
 Test Files  1 passed (1)
      Tests  34 passed (34)
```

**R18 remapeado** en el mapa de trazabilidad a estos seis casos, que son los que lo prueban de
verdad; los de unidad se quedan, pero **rotulados por lo que son**: con Prisma mockeado demuestran
que el código pasa la empresa, no que la base la honre.

#### La lección, y no es la del test que faltaba

**Esta ficha había PREDICHO este agujero y lo perdió.** La bitácora de la tanda 3, en «Riesgo
declarado», escribió que «`where: { id: batchId, companyId }` en `update()` no está probado contra
Postgres real … **quien lo demuestra de verdad es el test de integración de T15**». Y **T15 no lo
demuestra**, porque cuadra el libro con **una sola empresa**. Nadie volvió sobre ello: ni el cierre
de la tanda 6 («desviaciones: ninguna») ni el mapa de T17 lo anotaron.

Queda escrito aquí, con todas las letras: **una predicción correcta que no se persigue vale lo mismo
que no haberla hecho.** El riesgo se declaró, se le asignó un dueño y el dueño no lo cubrió; declarar
un riesgo no es mitigarlo, y una bitácora que lo declara y no lo cierra da una falsa sensación de
cobertura que es **peor** que no haberlo escrito. Lo cazó el reviewer leyendo nuestra propia
bitácora.

### B2 — cita de requisito en producción. CERRADO (`451b8c9`)

`app/(private)/inventario/components/product-list-section.tsx:38` conservaba `**R5**` en el JSDoc
que **T13bis reescribió**. `docs/conventions.md > Comentarios` lo prohíbe sin excepciones y manda
limpiar las líneas que la rama toca; la línea se tocó y salió con la cita puesta.

Reescrito en prosa, **commit de solo comentarios: ni una línea de código**. Las citas
**preexistentes** del mismo docblock (R14, R15, R16) **no se arrastran**.

**Vuelto a medir sobre el diff de producción de toda la rama** (`git diff origin/dev...HEAD -- app
lib db`): las únicas líneas añadidas que citan ficha o requisito son **las dos de la séptima
enmienda de `error-codes.ts`**, que es el menor 8 del reviewer y que R32 exige con esas palabras. La
afirmación de `934fe7c` vuelve a ser cierta, y arriba queda **corregida** en el sitio donde se
escribió.

**Es la tercera vez en esta ficha** (`934fe7c` limpió seis, la tanda 5 limpió una en
`adjust-batch-dialog.tsx`). Tres veces es un patrón, no un descuido: el comentario se escribe
citando el requisito porque el subagente tiene el requisito delante.

### B3 — la rama no estaba sobre el `origin/dev` actual. CERRADO (`a92f40d`)

`origin/dev` = `cbf0569`; `git merge-base HEAD origin/dev` daba `b625ca9`. Lo que `dev` ganó desde
la base son **siete commits de solo bookkeeping** —`feature_list.json`, `progress/current.md` y
`progress/history.md`—, **cero código** (`git diff --stat b625ca9 origin/dev`). Por eso el gate del
reviewer seguía siendo válido para el código y el re-merge salía barato.

**La trampa, que es lo que lo hacía bloqueante:** mergear sin cuidado **revierte en disco** el
board. La rama no había tocado `feature_list.json` desde la base, así que un merge distraído lo deja
en el estado **viejo**: QC-59 volvería de `done` a `in_progress` y QC-92 de `in_progress` a
`pending`, **con la descripción anterior a `/afinar-feature`**. Es justo el archivo que
`scripts/validate-features.mjs` valida en el gate, y contradice la regla 3 de `CLAUDE.md`.

Resuelto así, y comprobado después sobre el archivo resultante:

- **`feature_list.json` a favor de `dev`.** Verificado tras el merge: **QC-59 `done`** y **QC-92
  `in_progress`** con su descripción **acotada el 2026-09-17** («16 decisiones cerradas, CERO
  preguntas»). `git diff origin/dev -- feature_list.json` sale **vacío**.
- **`progress/current.md`** (único conflicto): versión de `dev` y **reaplicado encima** el único
  bloque nuestro —la deuda del gate rápido, 27 líneas—, sin pisar lo que escribieron las otras
  sesiones. `git diff origin/dev -- progress/current.md` da **exactamente 27 inserciones y nada
  más**.
- **`progress/history.md`**: idéntico al de `dev`.

### Gate COMPLETO sobre la rama ya re-mergeada — **un solo rojo, y es el heredado**

`./init.sh` (completo, **sin** `--rapido`), sobre `88432f2`, con `origin/dev` ya dentro:

```
✓ las 108 fichas vienen del proyecto QC
✓ regla max-2-por-zona respetada (in_progress=2)
✓ specs presentes para features sdd en vuelo
✓ base de desarrollo «QuimiCloude» al dia: 35 migracion(es) aplicada(s)
✓ typecheck paso
✓ lint paso

 Test Files  1 failed | 544 passed (545)
      Tests  1 failed | 7952 passed | 97 skipped (8050)
   Duration  493.60s

hay 1 archivo(s) de test en rojo que NO estan en el baseline:
  tests/unit/pedidos-ui/order-form.test.tsx
```

**Es exactamente lo esperado y ni uno más.** Dos comprobaciones sobre esos números:

- **8050 tests, contra los 8044 de la corrida del reviewer: +6 exactos**, que son los seis casos A/B
  de B1. No entró ni se perdió nada por el camino.
- **Ninguna guardia nueva se puso roja.** Un solo archivo en rojo en toda la suite, y no es de
  `tests/guards/`. El contador de archivos de guardia tocados sigue en **ocho** —la corrección del
  reviewer al siete de la bitácora— más las dos altas de censo. **No hay una novena.**

**El rojo, medido y no aceptado de oídas:** `tests/unit/pedidos-ui/order-form.test.tsx`, «R14 — sin
ningun lote, la existencia es 0 y el restante negativo se destaca como faltante»; espera `-0.201` y
recibe `-0.2`. El archivo es **idéntico a `origin/dev`** (`git diff --quiet origin/dev` pasa) y el
diff de rama sobre `tests/unit/pedidos-ui/`, `app/(private)/pedidos/` y `lib/modules/pedidos/` sale
**vacío**. Causa: el **PR #85** (redondeo a dos decimales) cruzado con el caso R14 de QC-91. **No es
de esta ficha.**

**`tests/baseline-rojos.json` NO se ha tocado**, y sigue siendo deliberado: la fila le corresponde a
quien arregle la deuda en `dev`. Es el **menor 7** del reviewer y **espera decisión del leader antes
del PR**: o se arregla en `dev`, o alguien añade la fila con su motivo y su fecha. Dejar el PR rojo
«porque ya sabemos por qué» es cómo un rojo deja de mirarse.

### Lo que esta vuelta NO toca, y espera al leader

- **Los ocho menores del informe**, íntegros. Excepción única y autorizada: el **menor 2**, un dato
  falso en el mapa —fechaba la nota de `qc91-alcance.test.ts:409` el **18** cuando es del **17**—,
  corregido arriba en la fila de R26. Un dato falso no es una opinión.
- **Menor 4** (`authorName` transporta el identificador en la frontera del puerto): el reviewer pide
  **ficha de seguimiento**, no solo una línea en la bitácora.
- **Menor 7** (el baseline): decisión escrita antes de pasar la ficha a `done`.
- **Menores 1 y 8** (la contradicción entre R26 y `conventions` §31, y el carve-out de la cabecera de
  enmiendas): los cierra `/afinar-regla` **en frío**, no esta ficha.
- **El PR no se abre.**

---

## Tanda A (enmienda del 2026-09-18) — T18: `kind` a enum y CHECK del catálogo de motivos

Delta sobre la ficha ya implementada y revisada. **Solo T18**: T19 (guardia de divergencia de
motivos, R37) y T20 (trazabilidad + gate) **no entraban en el encargo de esta tanda**.

### Archivos
**Creados**
- `db/migrations/20260918120000_inventory_movement_kind_enum_and_reason_catalog/migration.sql`
- `db/migrations/20260918120000_inventory_movement_kind_enum_and_reason_catalog/down.sql`

**Modificados**
- `db/schema.prisma` — `enum InventoryMovementKind { opening, adjustment }` declarado justo antes de
  `model InventoryMovement`; `kind String` → `kind InventoryMovementKind`. El comentario del modelo
  decía «`kind` y `reason` son `TEXT`» y ya no era verdad; se corrigió. `prisma format` realineó de
  paso el bloque de relaciones de `ProductBatch` (solo espacios).
- `tests/guards/guard-identificador-de-request.test.ts` — cuarta alta en `MIGRACIONES_ESPERADAS`.
- `tests/integration/inventario/inventory-movements-constraints.int.test.ts` — tres casos nuevos y
  el cast del helper de `$executeRaw`.

### La carpeta no puede terminar en `_inventory_movements`
`tests/unit/inventario/schema/inventory-movements-migration.test.ts:31` exige **exactamente una**
carpeta con ese sufijo. Por eso la migración se llama
`20260918120000_inventory_movement_kind_enum_and_reason_catalog`.

### Ciclo de la migración, verificado de verdad
Base `QuimiCloude_QC92E`, copiada con `CREATE DATABASE ... TEMPLATE "qct_tpl_5316b8e32d17"` (receta
de T16) y **sembrada a mano con dos asientos reales** (`opening`/NULL y `adjustment`/`merma`) antes
de migrar, para que la conversión se midiera sobre datos y no sobre una tabla vacía.

`migrate deploy` → `kind` = `InventoryMovementKind`, labels `opening`(1) / `adjustment`(2), tres
CHECK, las **dos filas intactas**, 36 en `_prisma_migrations` · `pnpm run db:rollback` → `kind` =
`text`, el tipo ya no existe, dos CHECK, **las dos filas intactas**, 35 filas · `migrate deploy` →
vuelve a quedar en enum, tres CHECK, filas intactas, 36 filas y `rolled_back_at` nulo.
La base temporal se borró al terminar.

### Censos
- `tests/guards/guard-identificador-de-request.test.ts` — **alta obligatoria**, lista cerrada.
- `tests/unit/inventario/schema/inventario-schema.test.ts` — **no hizo falta tocarlo**: el censo de
  modelos y el veto de «ningún enum suplanta el catálogo de unidades» siguen verdes con el enum
  nuevo. Medido, no supuesto.
- `tests/unit/pedidos/schema/pedidos-schema.test.ts`, `tests/unit/identity/schema/identity-schema.test.ts`
  y `tests/integration/recetas/recetas-constraints.int.test.ts` — verdes sin tocar.
- Ningún test afirmaba que `kind` fuera `String`/`TEXT` fuera del comentario del esquema.

### La trampa del helper de `$executeRaw`, medida
Con la columna ya enum, el parámetro de texto hacía que Postgres rechazara el INSERT con **42804**
antes de llegar al CHECK o al disparador: cuatro de los cinco casos existentes se pusieron rojos.
Se resolvió con `CAST(${kind} AS "InventoryMovementKind")` en el helper.

Segundo hallazgo: el mensaje de Postgres está **traducido** («la sintaxis de entrada no es válida
para el enum»), así que el caso del enum afirma sobre el **nombre del tipo** y el **valor
rechazado**, no sobre el texto. El SQLSTATE sí es 22P02.

### Mapa `R<n> -> test` de la enmienda
| Requisito | Test |
|---|---|
| R35 | `tests/integration/inventario/inventory-movements-constraints.int.test.ts` — «rechaza una clase que no es del enum con SQLSTATE 22P02 (R35)»; y el ciclo migrate→rollback→migrate con filas sembradas, arriba |
| R36 | mismo archivo — «acepta los cuatro motivos del catalogo en un ajuste (R36)» y «rechaza un motivo que no esta en el catalogo … (R36)» |
| R37 | **pendiente**: es T19, fuera del encargo de esta tanda |

### Salida real
- `pnpm run typecheck` → verde, sin salida. El dominio **no** cambió: `inventory-movement.ts`
  conserva su unión `'opening' | 'adjustment'` y Prisma genera el enum como unión de literales, así
  que el adaptador sigue compilando sin importar tipos de Prisma en el dominio.
- `pnpm run lint` → verde, sin salida.
- `pnpm exec vitest run tests/integration/inventario/inventory-movements-constraints.int.test.ts` → **8 passed (8)**.
- `pnpm exec vitest run tests/integration/inventario/` → **13 archivos, 165 passed**.
- `pnpm exec vitest run tests/unit/inventario/` → **49 archivos, 750 passed, 5 skipped**.
- `pnpm exec vitest run guard` → **46 archivos, 573 passed, 9 skipped**.
- `pnpm exec vitest related --run db/schema.prisma …/batch-movement-prisma.ts` → **161 archivos, 2481 passed, 1 skipped**.

Ninguna guardia heredada se puso roja. Ninguna dependencia nueva.

---

## La enmienda del 2026-09-18, escrita en el spec como tal — **ENMIENDA A D5**

Aprobada por el humano el 2026-09-18 sobre la ficha ya implementada, revisada y con PR abierto.
La escribió el implementer en el spec, no solo aquí: una enmienda aprobada se escribe en
`requirements.md`, que es el precedente de las dos enmiendas de QC-81 (D13 y D14).

### Qué se tocó del spec
- `specs/QC-92-ajuste-de-inventario/requirements.md` — sección nueva
  **«Enmienda del 2026-09-18: `kind` es un enum de Postgres y el motivo lo vigila un CHECK»**, con
  los requisitos **R35**, **R36** y **R37**; dos filas nuevas en «Decisiones cerradas» (**D17** y
  **D18**, la tabla pasa de 16 a 18 filas); y el bloque «Cómo leer las citas» actualizado con el
  aviso sobre D5.
- **R9 cambia de TEXTO** (no de número). Decía que añadir un motivo «NO DEBE requerir migración
  alguna». Con el CHECK puesto eso es **falso**, así que se reescribió y se marcó como modificado
  por la enmienda. Ningún otro requisito cambia de número ni de texto.
- `specs/QC-92-ajuste-de-inventario/design.md` — aviso de enmienda en §2.2 y en la viñeta de §2.1
  que decía «`kind` y `reason` son `TEXT`». El párrafo «añadir un motivo es **una línea**» se
  **conserva** con la corrección encima, para que se vea qué se cambió y por qué.
- `specs/QC-92-ajuste-de-inventario/tasks.md` — **Tanda 8** con T18, T19 y T20.

### Lo que NO se disimuló, y es el punto
**D5 eligió constante de dominio + zod + `TEXT` precisamente para que el catálogo de motivos
creciera SIN migrar.** Con el CHECK, **añadir un motivo pasa a costar una migración**. Eso es
exactamente lo que D5 quería evitar. El humano lo decidió **con ese coste delante** el 2026-09-18.

Se escribió como **enmienda fechada que dice qué cambia y por qué**, y **no** como algo compatible
con D5, para que dentro de tres fichas nadie lea D5, vea «crece sin migrar» y crea que puede añadir
un motivo tocando una línea. Si lo hiciera, la base rechazaría en producción con un `23514` que
nadie predijo.

### Los dos valores del enum, y por qué no hay un tercero
`opening` y `adjustment`, **y nada más**. El **consumo por lote** es pregunta abierta del dominio
**sin ficha** —declarado así en `requirements.md > Lo que NO entra` y en las specs de QC-81 y
QC-92—, y un valor que **nada puede producir** daría la falsa impresión de que está resuelto.
La minúscula tampoco es estilo: **los datos ya están escritos así**, y por eso la conversión es un
`USING kind::"InventoryMovementKind"` directo que no reescribe ni una fila (medido sobre dos filas
sembradas a mano, arriba).

### El orden de declaración no se reordena
Queda escrito en el `///` del enum en `db/schema.prisma`, sin citar ninguna ficha: Postgres ordena
un enum **por declaración**, así que reordenarlo obliga a **recrear el tipo**. Es la misma lección
que ya estaba escrita en `OrderStatus` («va el último: reordenar obligaría a recrear el tipo en vez
de añadir un valor») y en `OrderPriority`.

### El dominio no importa tipos de Prisma
`lib/modules/inventario/domain/inventory-movement.ts` **conserva** su unión
`'opening' | 'adjustment'`. **Medido por el implementer, no aceptado de oídas:**
`git diff -- lib/ app/` sale **vacío** en toda esta tanda — no hubo que tocar ni una línea de
producción fuera del esquema. Convertir es del **adaptador driven**, como ya decía el comentario de
ese archivo. Es arquitectura hexagonal (`docs/architecture.md > Dominio`), no estilo.


---

## Tanda B (enmienda del 2026-09-18) — T19: la guardia de divergencia de motivos

### Archivo
**Creado:** `tests/guards/guard-motivos-de-ajuste.test.ts` — **15 casos**.

### Qué vigila
El CHECK `inventory_movements_reason_in_catalog` **de la migración en disco** y la constante
`MOVEMENT_REASONS` tienen que nombrar **exactamente** los mismos motivos. **Igualdad, no
inclusión.** `MOVEMENT_REASONS` se **importa** del dominio; la lista del SQL se **extrae del
archivo**, no se copia.

Piezas, todas con autoprueba: `motivosDelCheck(sql)` —anclado al **nombre** de la restricción y con
paréntesis balanceados, así que no lo confunde `inventory_movements_reason_matches_kind`, que
también nombra `reason` y lleva literales entrecomillados—, `migracionesQueDeclaranElCheck()` —barre
`db/migrations/` y **no ata el nombre de la carpeta a mano**; solo lee `migration.sql`, por eso el
`DROP CONSTRAINT` del `down.sql` no la confunde— y la función **pura** `hallazgosDeMotivos`.

### Por qué en `tests/guards/` y no en `tests/unit/`
Escrito en la cabecera del archivo, en prosa y **sin citar ficha ni requisito**. Es la lección que
esta misma ficha pagó y que está arriba como **quinta familia**: el selector rápido filtra el diff a
fuentes JS/TS y relaciona por grafo de imports, así que un archivo que vigila un `.sql` **sin
importarlo** no lo relaciona nadie. En `tests/unit/` no correría al cambiar la migración, que es
justo el cambio que tiene que morder.

**Y quedó demostrado en la corrida de esta tanda, no solo razonado:** el archivo es *untracked*, así
que **no aparece** en la lista de 61 archivos del diff que selecciona `test:rapido`. Corrió igual,
en la etapa «todas las guardias». En `tests/unit/` no habría corrido ninguna de las dos veces.

### El orden no se compara, los duplicados sí
Se comparan **conjuntos ordenados**, porque el orden de un `IN (...)` de SQL no significa nada. Por
eso mismo los **duplicados se denuncian aparte**: al pasar por el conjunto se perderían, y un
duplicado podría comerse una diferencia al ordenar. Hay caso para cada lado.

### Anclas de vacuidad — el punto que más importa
Si el extractor no leyera nada, el `toEqual` compararía **dos vacíos y pasaría en verde** sin haber
comprobado nada. Cuatro anclas: exactamente **una** migración declara el CHECK; la lista extraída
**no** está vacía; `MOVEMENT_REASONS` **no** está vacía; y el extractor devuelve vacío sobre SQL
fabricado sin el CHECK.

### Prueba por mutación de las dos caras, contra el ÁRBOL REAL
Medido por el subagente **y vuelto a medir por el implementer**, que es la regla de esta ficha:

- **Cara A — motivo de más en la constante** (`devolucion_a_proveedor`): rojo, con el motivo
  nombrado y el `23514` anunciado.
- **Cara B — motivo de menos en el CHECK** (quitado `error_de_carga` de la migración): rojo, con el
  motivo que falta nombrado.

**Medición propia del implementer, que cubre las dos guardias de un tiro** —vaciar
`MOVEMENT_REASONS`—:

```
pnpm exec vitest run tests/guards/guard-motivos-de-ajuste.test.ts
  Tests  2 failed | 13 passed (15)
  - «ni la lista del SQL ni MOVEMENT_REASONS estan vacias»  -> rojo (el ancla de vacuidad)
  - «la lista del CHECK y MOVEMENT_REASONS son iguales»     -> rojo, los cuatro motivos nombrados

pnpm exec vitest run tests/integration/inventario/inventory-movements-constraints.int.test.ts
  Tests  1 failed | 7 passed (8)
  - expect(MOVEMENT_REASONS.length).toBeGreaterThan(0)      -> rojo
```

**El ancla de vacuidad distingue**: no se limita a fallar la igualdad, falla *por separado* diciendo
que la comparación se habría hecho sobre vacío. Mutación revertida con `git checkout --`;
`git diff -- lib/ app/` vuelve a salir **vacío**.

### Riesgo declarado de esta guardia
`toHaveLength(1)` sobre las migraciones que declaran el CHECK es una **lista cerrada de hecho**: si
una ficha futura vuelve a declarar ese CHECK en otra migración —por ejemplo para cambiar la lista—,
la guardia se pone roja. **Es deliberado** (con dos listas vivas la guardia no sabría cuál manda) y
el mensaje de error lo dice con esas palabras, pero queda escrito aquí para que el reviewer lo
juzgue a la vista y no lo descubra. Es de la **familia 3**, censo, y nace **ya** en `tests/guards/`,
que es donde le toca.

### Lo que esta guardia NO puede ver, escrito en su cabecera
Si el CHECK está **realmente aplicado en la base** —lee la migración en disco, no
`information_schema`—, ni si el esquema de zod usa de verdad `MOVEMENT_REASONS` en vez de su propia
copia. Lo primero lo cubren los casos de integración de T18; lo segundo, la guardia de R9.

---

## Tanda C — la tercera copia de la lista, cazada por el implementer

Al medir la tanda A apareció que el archivo de integración había nacido con **una tercera copia a
mano** de la lista, con un comentario que prometía una sincronía que **nada comprobaba**, y justo en
el archivo que debería probar que la base respeta el catálogo: con un quinto motivo en el dominio y
en el CHECK, el caso habría seguido probando cuatro y diciendo verde. **Toda esta enmienda existe
porque la lista pasó a vivir en dos sitios; añadir un tercero iba en contra de lo que estábamos
haciendo.**

Corregido: import real de `@/lib/modules/inventario/domain/movement-reason` (directo al dominio,
**no por el barrel**, para no mover censos de contrato); el caso recorre `MOVEMENT_REASONS`; se
renombró a «acepta **todos** los motivos del catalogo» —decía «los cuatro» y eso pasa a ser mentira
en cuanto entre un quinto—; **ancla de vacuidad**; y el motivo inválido **comprueba** su
no-pertenencia en vez de darla por hecha.

**Es el mismo patrón que esta ficha ya lleva anotado tres veces:** una afirmación escrita en
presente que nadie vuelve a medir. Aquí se cazó **antes** de commitear, midiendo el trabajo del
subagente en vez de aceptarlo.

---

## Verificación de la enmienda — qué se pudo correr y qué NO

### El gate completo NO se pudo correr. La causa es AJENA y está medida.

```
./init.sh
  ✗ feature_list.json invalido:
    faltan specs para features sdd en vuelo: QC-82
```

`./init.sh --rapido` **cae en el mismo punto**: la validación del board va **antes** de los tests en
los dos modos, así que ninguno llegó a ejecutar nada.

**No es nuestro, y no se dice de oídas:**

- `QC-82` está `spec_ready` con `sdd: true` y **no tiene specs en disco**, ni aquí ni en `dev`:
  `git ls-tree -d origin/dev --name-only specs/` no trae ni `QC-82` ni `QC-121`.
- **Prueba directa:** se corrió el validador **con el `feature_list.json` de `origin/dev`** y falla
  con el **mismo mensaje y el mismo código de salida**:
  ```
  git show origin/dev:feature_list.json > feature_list.json
  node scripts/validate-features.mjs
    faltan specs para features sdd en vuelo: QC-82
    exit=1
  ```
  Restaurado acto seguido; `git status -- feature_list.json` sale **vacío**.
- **`feature_list.json` NO se tocó.** La única diferencia con `origin/dev` es que `dev` avanzó **un
  commit de bookkeeping** después de nuestro último merge (`6333f88`, QC-61 a `done`). **Se
  comprobó expresamente que NO es la regresión de merge del bloqueante B3**: la rama simplemente va
  un commit por detrás, y el `in_progress` de QC-61 que tenemos es el valor viejo de `dev`, no uno
  que hayamos escrito.

### Las etapas del gate, corridas a mano una por una

| Etapa del gate | Resultado |
|---|---|
| `pnpm run typecheck` | **verde**, sin salida |
| `pnpm run lint` | **verde**, sin salida |
| `pnpm run test:rapido` (selección relacionada, 61 archivos del diff) | **368 archivos, 5524 passed, 26 skipped, 0 rojos** |
| `pnpm run test:rapido` (todas las guardias) | **47 archivos, 588 passed, 9 skipped, 0 rojos** |
| toda migración tiene `down.sql` (etapa 7) | **OK**, ninguna sin él |

Y, a mano, lo que el encargo pedía explícitamente:

```
pnpm exec vitest run tests/unit/inventario/        -> 49 archivos, 750 passed |  5 skipped
pnpm exec vitest run tests/integration/inventario/ -> 13 archivos, 165 passed
pnpm exec vitest run guard                         -> 47 archivos, 588 passed |  9 skipped
```

**Las guardias pasan de 46 a 47: la que sube es la nuestra.** Ninguna guardia heredada se puso roja,
así que **el contador de guardias enmendadas de esta ficha NO sube**: sigue en **ocho**. Esta tanda
añade **un alta de censo** (`MIGRACIONES_ESPERADAS`, la cuarta de la ficha) y **crea** una guardia
nueva; un alta no es una enmienda.

**El flake de jsdom apareció y no mordió:** «Not implemented: navigation to another Document» salió
dos veces en la corrida relacionada y los 368 archivos pasaron igual.

### Lo que NO se corrió, y por qué

- **`pnpm test` (la suite entera): NO.** Ni los subagentes ni el implementer corren la suite
  completa (`AGENTS.md > Regla del gate: quién corre qué`). **Le toca al leader**, y aquí hace falta
  de verdad, porque `./init.sh` completo no llegó a los tests.
- **El E2E: NO.** `init.sh` no corre Playwright. **Esta enmienda no toca la pantalla** —no hay ni un
  cambio bajo `app/`—, así que `e2e/ajuste-de-inventario.spec.ts` no cambia de sujeto; pero **toca
  la base sobre la que corre**, así que conviene re-correrlo a mano antes del PR.
- **El rojo heredado de `dev`** (`tests/unit/pedidos-ui/order-form.test.tsx`, PR #85 cruzado con R14
  de QC-91) **no apareció** en ninguna corrida de esta tanda porque no entra en la selección
  relacionada. **Sigue vivo y sigue esperando decisión del leader** (menor 7 del reviewer).
  `tests/baseline-rojos.json` **no se ha tocado**.

### Mapa `R<n> -> test` de la enmienda — las tres, mapeadas

| Requisito | Test que lo prueba |
|---|---|
| **R35** — `kind` es enum, dos valores, la conversión no reescribe filas y el dominio no importa Prisma | `tests/integration/inventario/inventory-movements-constraints.int.test.ts` → «rechaza una clase que no es del enum con SQLSTATE 22P02 (R35)»; el ciclo `migrate`→`rollback`→`migrate` con **dos filas sembradas a mano**, intactas en las tres vueltas; y `git diff -- lib/ app/` **vacío**, que es la prueba de que el dominio no cambió |
| **R36** — `reason` sigue `TEXT`, la base rechaza lo que no es del catálogo y el `NULL` del alta sigue pasando | mismo archivo → «acepta todos los motivos del catalogo en un ajuste (R36)» y «rechaza un motivo que no esta en el catalogo con SQLSTATE 23514 e `inventory_movements_reason_in_catalog` (R36)»; el `NULL` del alta lo siguen cubriendo los dos casos de `reason_matches_kind`, que siguen verdes |
| **R37** — guardia de igualdad exacta, dos caras y vacuidad, en `tests/guards/` | `tests/guards/guard-motivos-de-ajuste.test.ts`, 15 casos, con las dos mutaciones contra el árbol real pegadas arriba |

**34 requisitos + 3 de la enmienda = 37 declarados, 37 mapeados.**
