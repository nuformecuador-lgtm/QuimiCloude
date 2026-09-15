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

### Tanda 1 — T1, T2 y T3 (base y esquema) · `backend_dev`

**Archivos**
- `db/migrations/20260913120000_product_batch_lot_and_purchase_date/migration.sql` (nuevo): los siete
  pasos de design §2.1 en orden, con la guardia de duplicados por empresa (R21), el relleno de la
  fecha en UTC (R19), el relleno del lote de §2.3 (R18), `SET NOT NULL`, los dos `CHECK`, el indice
  `product_batches_company_lot_unique` y el cierre `ENABLE`+`FORCE`.
- `db/migrations/20260913120000_product_batch_lot_and_purchase_date/down.sql` (nuevo): orden inverso,
  no vacia ningun `lot` (R23) y la cabecera dice que se pierden las `purchase_date`.
- `db/schema.prisma` (solo `ProductBatch`): `lot String`, `purchaseDate DateTime @db.Date`,
  `@@unique([companyId, lot], map: "product_batches_company_lot_unique")`.
- `tests/unit/inventario/schema/product-batch-lot-migration.test.ts` (nuevo, 13 casos, cada predicado
  probado tambien contra una mutacion en memoria).
- `tests/unit/inventario/schema/inventario-schema.test.ts` (actualizacion aprobada en F1.4).

**Verificacion real** (extracto literal del informe del agente)
- Base de desarrollo, que es compartida: `db:migrate` aplico **solo** QC-81, con columnas, CHECK,
  indice y RLS forzada comprobados por consulta. La fila existente (`lot='1'`) recibio `purchase_date`
  = dia UTC de su `created_at`. `db:rollback` revirtio todo. **Comprobado por el implementer despues:**
  ```
  $ pnpm exec prisma migrate status
  29 migrations found in prisma/migrations
  Following migration have not yet been applied:
  20260913120000_product_batch_lot_and_purchase_date
  ```
  La base de desarrollo queda **revertida**, como se decidio arriba.
- **R20, tabla vacia.** `pnpm run db:test template` reutilizo la plantilla `qct_tpl_92d13dc6eb14`, con
  la huella de este `migration.sql`, que construyo hoy la corrida de `vitest related` de la tanda 2.
  Como evidencia propia se repitio la receta literal de la plantilla sobre una base vacia de usar y
  tirar:
  ```
  --- paso 1: migrate deploy (se espera parada en QC-49)   codigo=1  Migration name: 20260911130000_inventory_company_scope
  --- paso 3: resolve --rolled-back QC-49                  codigo=0
  --- justo antes del paso 4: estado de product_batches    [{"filas":0}]
  --- paso 4: migrate deploy (aqui corre QC-81)            codigo=0
  Applying migration `20260913120000_product_batch_lot_and_purchase_date`
  All migrations have been successfully applied.
  --- paso 5: migrate status   codigo=0   Database schema is up to date!
  --- paso 6: db:seed          codigo=0   [{"lotes_tras_seed":0}]
  ```
- **R18, R19, R21 y R23 ejercitados sobre filas sembradas**, en bases de usar y tirar copiadas de la
  plantilla anterior a QC-81, ya borradas. Tres empresas; la sesion en `America/Guayaquil` para
  demostrar que manda el UTC. Resultados:
  - `'50'` a mano ⇒ las filas sin lote reciben 51..55 por orden de `created_at`.
  - `'007'` ⇒ 8, 9, 10; el empate de `created_at` lo desempata el `id`.
  - Empresa sin lote numerico ⇒ `1`.
  - `'ACME-2026-07'` y un lote de 25 digitos quedan intactos y no revientan.
  - `23:30-05:00` ⇒ `purchase_date` del dia UTC siguiente. Ninguna fila recibe la fecha de hoy y
    `updated_at` no cambia.
  - Las restricciones muerden: blanco da 23514 not_blank, NULL da 23502, 61 caracteres dan 23514
    length, `'50'` repetido en la misma empresa da 23505, y `'50'` en otra empresa se acepta.
  - DOWN: quita todo, no vacia ningun lote (15 filas intactas); re-UP es un relleno de cero filas.
  - DUP: dos lotes repetidos ⇒ `P0001 QC-81: hay 2 lote(s) repetido(s)...`, con la consulta para
    localizarlos y que hacer, y el esquema sin nada a medias.
- Tests y lint:
  ```
  $ pnpm exec vitest run tests/unit/inventario/schema/      (repetido por el implementer)
   Test Files  8 passed (8)
        Tests  123 passed (123)
  $ pnpm exec vitest run schema migration
   Test Files  28 passed (28)
        Tests  593 passed (593)
  $ pnpm run lint   -> exit 0
  ```

**Desviaciones, anotadas para el reviewer**
1. **`ROW_COUNT` del relleno de `lot`.** tasks.md T1 dice «cada UPDATE compara su ROW_COUNT contra el
   total de la tabla». Para `purchase_date` se hace asi. Para `lot`, al pie de la letra, contradice
   R18: ese UPDATE solo toca las filas **sin** lote, y habria abortado en la base de desarrollo (1 fila
   con lote, 0 actualizadas). Se compara contra las filas sin lote contadas justo antes y despues se
   comprueba que no queda ninguna. Es la unica lectura compatible con R18.
2. **`inventario-schema.test.ts`: tres afirmaciones invertidas, no solo `:1082`.** Tambien chocaban
   `:433` (otra `lot.isOptional === true`, fuera del bloque QC-80) y `:1111` (la ausencia de
   `@@unique` sobre `lot`, «es QC-81»). Las tres se invierten con su motivo; no se borra ningun
   bloque. `:433` va algo mas alla del texto literal de lo aprobado en F1.4, aunque es la misma
   afirmacion.
3. La guardia de duplicados excluye los lotes en blanco: el relleno les da numeros distintos.
4. design §2.4 atribuye al `down.sql` una guardia que lee la tabla. El DOWN es solo DDL y no lee
   filas, asi que no se invento ninguna guardia; el parentesis de RLS si esta, simetrico.
5. Un lote ya existente de mas de 60 caracteres haria abortar la migracion con un 23514 generico,
   sin mensaje propio. Sigue siendo atomica; el design no pide guardia para eso.

## Rojos abiertos al cerrar las tandas 1 y 2

1. **Guardia** `tests/guards/guard-identificador-de-request.test.ts:161-219`: su lista cerrada
   `MIGRACIONES_ESPERADAS` necesita `20260913120000_product_batch_lot_and_purchase_date` con su
   comentario, como hicieron QC-79, QC-86 y QC-23. Esta bajo `tests/guards/**`, esta permitido y
   ninguna task lo lista.
2. **Typecheck**, 11 errores:
   - `product-prisma.ts(545,5)`: esperado, lo cierra T6.
   - Los fixtures de integracion listados en «Arrastre»: tanda 3.
   - `e2e/aislamiento-inventario.spec.ts(211,5)`: **BLOQUEO**, ver arriba.
3. `vitest related`: tres archivos de integracion con `Argument lot is missing`, que son los mismos
   fixtures.

## Estado al parar (F2.1 detenida por el bloqueo del E2E)

| Task | Estado |
|---|---|
| T0 | [x] aprobada `batch_duplicate_lot` |
| T1 | [x] migracion verificada contra bases reales |
| T2 | [ ] esquema hecho y `prisma validate` en verde; **falta typecheck en verde** (T6 + fixtures + bloqueo E2E) |
| T3 | [x] 123/123 |
| T4, T5 | [x] 70/70 |
| T6-T12 | sin empezar |

**Por que se para aqui y no se abre la tanda 3.** El esquema que exige la ficha deja sin compilar un
E2E existente. Cualquier camino para ponerlo verde toca `e2e/**`, que R29, T11 y la instruccion del
leader prohiben, o bien cambia el diseño. Es una contradiccion entre el spec y el codigo real de
`dev`, y la regla es anotarla y parar. T6-T10 no dependen de esa decision, pero el gate de la tanda
no puede salir verde sin ella, y T11 tiene que saber si tolera ese archivo.

**Para retomar**, cuando el leader/humano decida sobre el E2E:
- tanda 3: T6, luego T7 [P] y T9, luego T8, con la actualizacion de los fixtures de «Arrastre» y
  de la guardia de migraciones;
- tanda 4: T10 [P] y T11 [P], con T11 ajustado a la decision del E2E;
- T12: mapa R1..R33 -> test y gate completo, **pendiente del leader**.

## Mapa R -> test (parcial, se completa en T12)

| R | Test (hasta ahora) |
|---|---|
| R1 | `inventario-schema.test.ts` (`purchaseDate.isOptional === false`); real: 23502 en base |
| R2 | `create-product.test.ts` «pasa al puerto la fecha civil UTC del now inyectado, y el MISMO instante como now»; `product-batch-input.test.ts` «acepta el alta sin purchaseDate, ausente o en null...» |
| R3 | `create-product.test.ts` «pasa tal cual una fecha de la semana pasada», «pasa la fecha escrita identica tambien al agregar el lote a un producto existente» (integracion: T8 caso 8, pendiente) |
| R4 | `create-product.test.ts` «rechaza la fecha de manana con ValidationError senalando purchaseDate y cero llamadas al repositorio», «decide «futura» contra el dia UTC del now inyectado...» |
| R5 | `create-product.test.ts` «acepta hoy y una fecha de meses atras sin corregirlas» |
| R6 | `product-batch-input.test.ts` «rechaza la fecha sin forma YYYY-MM-DD con un solo issue en purchaseDate», «rechaza la fecha con forma correcta que no existe en el calendario» |
| R7 | `inventario-schema.test.ts` (`lot.isOptional === false`); `product-batch-lot-migration.test.ts` «R7, R11 y R22...» (integracion: T8 caso 9, pendiente) |
| R8 | `create-product.test.ts` «pasa lot null al puerto -«generalo»- cuando el lote no viene...» (integracion: T8 caso 1, pendiente) |
| R10 | `create-product.test.ts` «pasa el lote escrito tal cual, recortado, sin sustituirlo -QC-81 R10-» |
| R11, R12 | `inventario-schema.test.ts` (`@@unique([companyId, lot])`, ninguna unicidad global) (integracion: T8 casos 5 y 6, pendiente) |
| R17 | `product-batch-lot-migration.test.ts` «R17: existe exactamente UNA migracion...», «R17: el down quita indice, CHECK, NOT NULL...» |
| R18 | `product-batch-lot-migration.test.ts` «R18: el relleno de lote numera por empresa...» (integracion: T8 caso 10, pendiente) |
| R19 | `product-batch-lot-migration.test.ts` «R19 y R26: purchase_date nace DATE anulable sin DEFAULT y se rellena con created_at en UTC» |
| R20 | prueba real sobre base vacia (arriba) (integracion: T8 caso 10, pendiente) |
| R21 | `product-batch-lot-migration.test.ts` «R21: la guardia de duplicados por empresa va antes de todo cambio...» |
| R22 | `product-batch-lot-migration.test.ts`: parentesis de RLS, ROW_COUNT, rellenos antes de SET NOT NULL, CHECK e indice despues |
| R23 | `product-batch-lot-migration.test.ts` «R23: el down no contiene ningun UPDATE que vacie lot...» |
| R24 | `create-product.test.ts` «rechaza a un actor %s con UnauthorizedError sin llamar al reloj ni al puerto» |
| R26 | `product-batch-lot-migration.test.ts` «R26: sin borrado, sin marcas de tiempo...»; `inventario-schema.test.ts` |
| R9, R13, R14, R15, R16, R25, R27, R28-R33 | **pendientes** (T6-T11) |

## Gate

**Pendiente del leader.** Ni el implementer ni los subagentes corren `./init.sh` ni la suite completa
(`AGENTS.md > Regla del gate`). Hoy el gate saldria rojo por los rojos abiertos de arriba.
