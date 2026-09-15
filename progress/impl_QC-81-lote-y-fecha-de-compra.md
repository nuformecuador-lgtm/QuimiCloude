# QC-81 — lote-y-fecha-de-compra · bitacora de implementacion (F2.1)

> Implementer. Worktree `.worktrees/QC-81-lote-y-fecha-de-compra`, rama
> `feature/QC-81-lote-y-fecha-de-compra`. Delegado en `backend_dev`. Sin pantalla: cero archivos bajo
> `app/**`, `components/**`, `e2e/**`, y ninguna dependencia nueva.

## T0 — Respuesta del humano sobre el catalogo de errores

- **Aprobada** la sexta enmienda al catalogo cerrado: codigo `batch_duplicate_lot`, texto
  «Ya existe un lote con ese valor en esta empresa.». Aprobada por el humano el **2026-09-15** en la
  puerta F1.4 de QC-81, junto con el spec (transmitido por el leader al lanzar F2.1).
- **Plan B (`invalid_input`) descartado.** R13 se mantiene entero: rechazo distinguible, codigo y
  mensaje propios.
- En T9 la enmienda se escribe en la cabecera de `lib/modules/errores/domain/error-codes.ts` con el
  mismo formato que la cuarta y la quinta.
- Tambien aceptado en F1.4: T3 actualiza `tests/unit/inventario/schema/inventario-schema.test.ts:1082`
  con el precedente de `:1030-1048`.

## Sincronizacion con `dev` (antes de T1)

- La rama iba 13 commits por detras de `origin/dev`. `git fetch origin dev` + `git merge origin/dev`:
  merge limpio, sin conflictos, commit `d108789`.
- **Ninguna migracion entra en el tramo.** Ultima migracion tras el merge:
  `20260912103000_session_revocation`, anterior a `20260913120000`. No hay que parar.
- Lo que entra y roza el alcance, revisado: `lib/composition/index.ts` (asignaciones),
  `tests/integration/aislamiento.json` (dos entradas de asignaciones),
  `tests/guards/guard-lote-sin-join.test.ts` (pedidos/asignaciones, no lotes de inventario) y
  `tests/guards/guard-qc102-limites-de-la-ficha.test.ts` (sus casos de diff se saltan fuera de la
  rama de QC-102). Ningun archivo de `lib/modules/inventario/**` ni de `lib/modules/errores/**` cambia:
  las referencias de linea del `design.md` siguen valiendo.

## Entorno del worktree

- El worktree no traia `node_modules` ni `.env`. Se copio el `.env` del arbol principal, igual que
  tienen QC-93, QC-96 y QC-101, y se instalo con `pnpm install --frozen-lockfile`. `git status` sale
  limpio despues: `package.json` y `pnpm-lock.yaml` intactos (R30). Se corrio `prisma generate`.
- La base del `.env` es Postgres local (`localhost:5432/QuimiCloude`), **compartida con todos los
  worktrees**.
- **Decision sobre la base de desarrollo (T1).** Tras aplicar y revertir la migracion para cumplir
  el «hecho» de T1, la base de desarrollo se deja **revertida**. Si se dejara aplicada, el
  `lot NOT NULL` y el `purchase_date NOT NULL` harian fallar toda alta de producto desde el arbol
  principal y desde cualquier otro worktree, porque su cliente Prisma no escribe `purchase_date`. Los
  tests de integracion no dependen de esto: corren sobre la base efimera de QC-77, cuya plantilla se
  reconstruye sola con la migracion nueva. Aplicarla a la base de desarrollo cuando la rama entre en
  `dev` es el paso manual de F2.3.

## Tandas

_(se completa al cerrar cada tanda)_

### Tanda 2 — T4 y T5 (dominio y contratos) · `backend_dev`

**Archivos modificados**
- `lib/modules/inventario/domain/product-batch-input.ts`: `CIVIL_DATE_PATTERN` compartido,
  `esDiaDeCalendario` (con `Date.UTC`, la cadena no se convierte en el borde), `purchaseDateSchema`
  (`regex` con `abort: true` + `refine`) declarado `.nullish()`, docblocks de `purchaseDate` y
  `lotSchema` reescritos.
- `lib/modules/inventario/domain/product-batch.ts`: `readonly purchaseDate: string`; docblock de
  `lot` segun design §3.1 (`null` = «que lo genere el backend»).
- `lib/modules/inventario/domain/create-product.ts`: `fechaCivilUtc`, `resolverFechaDeCompra`. Orden:
  permiso → ambito → zod → `now()` una sola vez + fecha → costo → nombre → escritura. El mismo
  instante va a la fecha y a `created_at`/`updated_at`.
- `tests/unit/inventario/product-batch-input.test.ts` y `tests/unit/inventario/create-product.test.ts`.

**Salida real**
```
pnpm exec vitest run tests/unit/inventario/product-batch-input.test.ts tests/unit/inventario/create-product.test.ts
 Test Files  2 passed (2)
      Tests  70 passed (70)
pnpm run lint  -> exit 0, sin hallazgos
```
`vitest related` sobre los tres archivos de dominio: `node` y `ui` en verde. Tres archivos de
`integration` en rojo, con `Argument lot is missing`: son siembras con `prisma.productBatch.create`
rotas por el esquema de la tanda 1, no por el dominio (ver «Bloqueo» y «Arrastre» abajo).

**Lecturas del spec, anotadas para el reviewer**
1. **`create-product.test.ts:307, 314, 317` (design §0.2 fila 9 frente a §3.1).** Manda §3.1, que es
   el diseño detallado: el puerto no cambia de firma y el caso de uso sigue pasando `lot: null` para
   decir «generalo». El unitario del caso de uso afirma eso, con el nombre del test reescrito, y un
   caso nuevo de lote escrito que llega recortado (R10). El correlativo generado lo prueba T8 contra
   base real. La fila 9 no se puede cumplir al pie de la letra en un unitario con dobles: el numero
   lo calcula el adaptador.
2. **R4 «señalando el campo `purchaseDate`».** `ValidationError` no lleva ruta de campo. La fecha
   futura se señala en el `diagnostic`, que va al log y no al navegador. **No es una regresion ni
   una asimetria nueva**: hoy cualquier fallo de zod dentro del caso de uso se convierte en
   `new ValidationError()` **sin ningun campo** (`create-product.ts:138`), asi que R6 tampoco llega
   con campo a quien llama al caso de uso. El campo solo lo ve el esquema, que es el que usa el
   formulario. Pintar el rechazo de R4 en el campo seria cambiar el contrato de errores del borde,
   que es de la pantalla (QC-103).
3. `now()` se lee ahora justo despues de zod y ya no despues de `findAliveIdByName`. Sigue despues
   del permiso, y el test (d) de R24 comprueba que un actor sin permiso no llega a leer el reloj.

**Tests por requisito (tanda 2)**: ver el mapa consolidado en T12.

## BLOQUEO — un E2E existente deja de compilar con el esquema de T2

`e2e/aislamiento-inventario.spec.ts:210-219` siembra el lote con `prisma.productBatch.create` **sin
`lot` ni `purchaseDate`**. Con el esquema de T2 (`lot String`, `purchaseDate` obligatorio, sin
`DEFAULT` en la base, design §2.1 paso 2), `pnpm run typecheck` da rojo en ese archivo:

```
e2e/aislamiento-inventario.spec.ts(211,5): error TS2322: ... missing the following properties from type 'ProductBatchUncheckedCreateInput': lot, purchaseDate
```

y en ejecucion la siembra fallaria por `NOT NULL`. Arreglarlo exige **modificar un E2E existente**:
- R29: «NO DEBE añadir ningun test E2E nuevo **ni modificar los existentes**».
- T11 / R28-R29: el diff de la rama bajo `e2e/**` debe ser vacio.
- Instruccion del leader para F2.1: cero archivos bajo `e2e/**`; si una task lo pide, parar y avisar.

**No se ha tocado `e2e/**`.** Esto contradice el spec y lo tiene que decidir el leader/humano. Opciones
que veo, sin elegir ninguna:
- (a) **Excepcion acotada a R29**: tocar solo la siembra de `e2e/aislamiento-inventario.spec.ts:210-219`
  (añadir `lot` y `purchaseDate` al fixture), sin recorrido nuevo ni cambio de aserciones, y que T11
  tolere exactamente ese archivo.
- (b) Cambiar el diseño para que la siembra por Prisma siga compilando sin esos campos, es decir con
  `DEFAULT` en la base para `purchase_date` **y** generacion del lote en la base. Choca con design §2.1
  paso 2, §3.1 y §6, y con D8 para el `DEFAULT`. No lo recomiendo; lo nombro para que conste.

## Arrastre fuera de las listas de archivos de `tasks.md` (no es bloqueo)

El design §0.2 fila 12 decia que `company-scope-queries.int.test.ts:230` «sigue compilando». **No es
asi**, y ademas hay mas siembras directas con `prisma.productBatch.create` sin `lot`/`purchaseDate`
que ninguna task lista. Todas estan bajo `tests/integration/**` (permitido), y habra que ponerlas al
dia en la tanda 3:
- `tests/integration/inventario/company-scope-queries.int.test.ts:208` y `:225-233` (`NewProductBatch` sin `purchaseDate`)
- `tests/integration/inventario/product-batch-write.int.test.ts:264-272` (`NewProductBatch`)
- `tests/integration/inventario/company-scope.int.test.ts:466`
- `tests/integration/inventario/list-query-products.int.test.ts:169`
- `tests/integration/inventario/presentation-uniqueness.int.test.ts:185`
- `tests/integration/inventario/presentation-unit.int.test.ts:132`
- `tests/integration/recetas/recetas-constraints.int.test.ts:944`
- `tests/integration/unidades/unidades-constraints.int.test.ts:312`
