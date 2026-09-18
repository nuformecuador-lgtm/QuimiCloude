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
