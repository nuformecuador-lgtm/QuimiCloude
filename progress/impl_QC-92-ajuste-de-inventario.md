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
