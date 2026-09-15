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

## DECISION — excepcion acotada a R29 (2026-09-15, humano)

**Lo que motivo la parada.** `e2e/aislamiento-inventario.spec.ts:210-219` siembra el lote con
`prisma.productBatch.create` **sin `lot` ni `purchaseDate`**. Con el esquema de T2 (`lot String`,
`purchaseDate` obligatorio, sin `DEFAULT` en la base, design §2.1 paso 2), `pnpm run typecheck` daba
rojo:

```
e2e/aislamiento-inventario.spec.ts(211,5): error TS2322: ... missing the following properties from type 'ProductBatchUncheckedCreateInput': lot, purchaseDate
```

Ademas, en ejecucion la siembra fallaria por `NOT NULL`. Ponerlo verde exigia modificar un E2E
existente, y R29 lo prohibe («ni modificar los existentes»). F2.1 se paro en el commit `93edbd3` y se
subio al leader.

**Decision del humano, 2026-09-15: opcion (a), una excepcion acotada a R29.** La transmitio el leader
al retomar F2.1.
- **Se permite solo esto:** en `e2e/aislamiento-inventario.spec.ts:210-219`, dentro de la
  preparacion de `prisma.productBatch.create`, añadir `lot` (un valor legible y unico por corrida) y
  `purchaseDate` (una fecha civil pasada convertida con `T00:00:00Z`, como hace el adaptador). Sin
  cambiar el recorrido, ni las aserciones, ni ningun otro archivo de `e2e/**`.
- **T11:** R29 tolera **exactamente ese archivo**, nombrado en el test con un comentario que cita la
  decision. Cualquier otro archivo bajo `e2e/**` sigue dando rojo. R28 (`app/**`, `components/**`) y
  R30 no cambian.
- **Descartada** la opcion (b), el `DEFAULT` en la base.
- **El texto de R29 en `requirements.md` NO se edita.** La enmienda queda escrita en
  `progress/current.md` (leader), en el issue y en esta bitacora.
- **El E2E no se ejecuta en esta ficha**: QC-101 corre ahora mismo el suyo contra la misma base.

**Base de datos compartida.** Instruccion del leader al retomar: la base de desarrollo
`localhost:5432/QuimiCloude` queda revertida y **no se vuelve a migrar** con QC-81, porque QC-101 la
esta usando. La integracion (T8) corre sobre la base temporal por corrida de QC-77.

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

### Tanda 3a — T9, T7, T10 y T6 (parcial) · `backend_dev`

**Archivos**
- **T9:**
  - `lib/modules/errores/domain/error-codes.ts`: la sexta enmienda en la cabecera y `'batch_duplicate_lot'`.
  - `lib/modules/errores/domain/error-catalog.ts`: la clave y el texto exacto «Ya existe un lote con
    ese valor en esta empresa.».
  - `lib/modules/inventario/domain/errors.ts`: `BatchDuplicateLotError`.
  - `tests/unit/errores/catalogo.test.ts`: el conteo pasa de 45 a 46 y hay un bloque R13.
- **T7:** `lib/modules/inventario/index.ts` reexporta `BatchDuplicateLotError` como los demas errores.
  Puertos sin cambio de firma y `lib/composition/index.ts` sin tocar.
- **T10:** `lib/modules/inventario/adapters/driving/product-actions.ts` gana
  `purchaseDate: readOptionalFormString(formData, 'purchaseDate')` en `buildCreateProductCandidate`,
  sin tocar `buildUpdateProductCandidate`; cuatro casos en `tests/unit/inventario/product-actions.test.ts`.
  El traductor unico de errores del modulo reconoce cualquier subclase de `InventarioError`, asi que el
  borde entrega `batch_duplicate_lot` sin mas cambios, y un test lo fija.
- **T6 (parcial):** `product-prisma.ts` con `resolveLot`:
  - el lock `pg_advisory_xact_lock(81, hashtext('product_batches_lot:' || companyId))` va con
    `$executeRaw` como sentencia propia y ANTES del `SELECT max`, con un docblock sobre READ COMMITTED;
  - el maximo se toma sobre `'^[0-9]{1,18}$'` con la empresa de `companyScopeColumns(scope)` (R27);
  - el lote escrito a mano no pide lock ni calcula maximo;
  - estan `toBatchPurchaseDate` y `purchaseDate` en `toBatchCreateData`, en los dos caminos
    (`createWithFirstBatch` y `addBatchToAlive`).

**Salida real**
```
$ pnpm exec vitest run --project node --project ui tests/unit/inventario tests/unit/errores
 Test Files  36 passed (36)
      Tests  564 passed (564)
$ pnpm exec vitest run guard
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
$ pnpm run lint  -> exit 0
```

**Correccion al design decidida por el implementer: como se reconoce el lote duplicado (T6)**

design §3.3 y §4.4 piden que `isDuplicateBatchLot` reconozca el `P2002` por el **nombre del indice**
`product_batches_company_lot_unique`, siguiendo a `isDuplicateOrderNumber`. Con `@prisma/client`
6.19.3 contra Postgres **eso no casa nunca**:
- La API tipada que manda §3.2 paso 3 trae en `meta.target` las **columnas**, no el nombre del indice.
- Esta verificado contra base real y escrito en `lib/modules/unidades/adapters/driven/persistence/unit-write-prisma.ts:21-48`
  (QC-76, donde fue un bug real con R11 y R12 rotos). Tambien lo siguen `recipe-prisma.ts`,
  `supplier-prisma.ts` y `tests/integration/identity/credential-setup.int.test.ts:59-61`.
- `isDuplicateOrderNumber` si encuentra el nombre, pero solo porque `pedidos` inserta con SQL crudo y
  lo busca en el texto del mensaje.

Implementado al pie de la letra, R13 saldria como `unexpected` y R15 no reintentaria nunca.

**Decision: opcion A, reconocer por columnas** (`P2002` y `meta.target` = `company_id` + `lot`).
- Conserva la intencion del design entera: dos condiciones, y relanzar lo que no se reconoce.
- `product_batches` no tiene otro unico sobre esas columnas.
- **No se improvisa.** Es la convencion ya documentada del repo para este motor y esta version, y
  no cambia ningun requisito.
- **Descartadas:**
  - B, aceptar nombre o columnas: añade una rama muerta;
  - C, pasar el `INSERT` a `$queryRaw`: contradice §3.2 paso 3.
- **Lo prueba T8 caso 4 contra base real:** si el mecanismo fuese falso, ese caso da rojo.

Lo que faltaba de T6 (`isDuplicateBatchLot`, el reintento acotado a 3, la traduccion a
`BatchDuplicateLotError` y el unitario del reintento) se delega en un `backend_dev` nuevo con esta
decision fijada.

**Notas para el reviewer**
1. El design no fija el entero del namespace del lock (`<ns>`). Se eligio `81` en la constante
   `BATCH_LOT_LOCK_NAMESPACE`. La forma de dos enteros no colisiona con el `pg_advisory_lock(bigint)`
   de `tests/helpers/test-database.ts`.
2. El lock va con `$executeRaw` porque `pg_advisory_xact_lock` devuelve `void`. Su efecto real lo
   prueba T8 caso 7 (la carrera).
3. `vitest related` saca en rojo `tests/unit/recetas-ui/recipe-route-contract.test.ts` («la feature
   no toca lib/modules/recetas ni db/»), porque la migracion de T1 aparece en el diff de la rama. Ese
   archivo esta en `tests/baseline-rojos.json`; se revisa aparte (ver «Rojos ajenos»).

### Cierre de T6 — reconocimiento del duplicado, reintento y traduccion · `backend_dev`

**Archivos**
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`:
  - `BATCH_LOT_UNIQUE_COLUMNS = {company_id, lot}`, con un docblock que explica la correccion al
    design y cita `unit-write-prisma.ts`, `recipe-prisma.ts` y `supplier-prisma.ts`;
  - `uniqueTargetsOf` y `isDuplicateBatchLot`, que exige `P2002` y que el conjunto de columnas sea
    exactamente `{company_id, lot}`;
  - `BATCH_LOT_MAX_ATTEMPTS = 3`;
  - `writeBatchWithLotRetry`, el unico sitio de la politica, que usan los dos caminos. Cada intento
    abre una `prisma.$transaction` nueva. Un choque con lote a mano lanza `BatchDuplicateLotError` sin
    reintentar. Un choque con lote generado da otra vuelta. Agotados los intentos, lanza `Error`
    («... empresa <id>, ultimo lote intentado '<lote>', 3 intentos») con `cause`. Lo que no se
    reconoce pasa por `translateBatchWriteError` como antes. Un solo `catch`, con cuerpo.
- `tests/unit/inventario/product-batch-lot-retry.test.ts` (nuevo, 14 casos con dobles de Prisma).

**Salida real**
```
$ pnpm run typecheck   -> EXIT=0 (todo el repo)
$ pnpm run lint        -> EXIT=0
$ pnpm exec vitest run --project node --project ui tests/unit/inventario tests/unit/errores
 Test Files  37 passed (37)
      Tests  578 passed (578)
$ pnpm exec vitest run guard
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
$ pnpm exec vitest run --project node tests/unit/inventario/product-batch-lot-retry.test.ts
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

**Tests (`product-batch-lot-retry.test.ts`)**
- R13 y R15, el reconocimiento:
  - «es verdadero con P2002 y meta.target con las columnas company_id y lot»
  - «es verdadero con la misma pareja en el otro orden: se compara el conjunto»
  - «es falso con P2002 sobre otras columnas»
  - «es falso con P2002 sin meta.target inspeccionable o con target como cadena suelta»
  - «es falso con otro codigo aunque meta.target traiga company_id y lot»
  - «es falso con un Error suelto que dice P2002»
- R15, el reintento:
  - «reintenta en una transaccion nueva, con maximo nuevo, y a la segunda escribe»
  - «se para en 3 intentos y lanza un Error con empresa, ultimo lote e intentos, con el choque como cause»
  - «un P2002 ajeno se relanza tal cual y sin reintentar»
  - «con lote generado reintenta y a la segunda escribe» (`addBatchToAlive`)
- R13 y R10:
  - «no reintenta, no pide lock ni maximo, y sale BatchDuplicateLotError»
  - «con lote escrito a mano no reintenta y sale BatchDuplicateLotError» (`addBatchToAlive`)
- No regresion:
  - «un P2003 de la presentacion sigue saliendo como ValidationError y sin reintentar»
  - «con el producto borrado o ajeno devuelve null sin pedir lock ni escribir»

**Notas para el reviewer**
1. **Conjunto exacto de columnas, no «contiene».** Un `target` con una tercera columna no se reconoce
   y se relanza: un indice futuro no se anuncia como «lote duplicado».
2. **`target` como cadena** cuenta como una sola columna, igual que en `unit-write-prisma.ts`, asi que
   se relanza crudo y nunca se traduce mal. Con 6.19.3 llega como array; T8 caso 4 lo prueba contra la
   base real.
3. **El «hecho» de T6 dice que el adaptador es el unico archivo del modulo que importa
   `@prisma/client`.** Eso **ya era inexacto antes de QC-81**: tambien lo importan `company-scope.ts`
   (`import type`) y `presentation-prisma.ts`, los dos adaptadores driven de persistencia. QC-81 no
   añade ningun importador, y la guardia de arquitectura (domain y ports sin Prisma) sigue verde. La
   frase «UNICO archivo del modulo» de los docblocks previos (`product-prisma.ts:33-35`,
   `presentation-prisma.ts:23`, `domain/product-batch.ts:6`) queda como deuda anotada; no se corrige
   aqui, porque no es alcance de QC-81.
4. **`design.md` §3.3/§4.4 y `tasks.md` T6 siguen diciendo «nombre del indice».** No se edita el spec
   desde la implementacion; la correccion vive en el docblock del adaptador y en la seccion «Tanda 3a»
   de esta bitacora.

### Tanda 3b — fixtures, excepcion del E2E, guardia de migraciones y T11 · `backend_dev`

**Archivos**
- **Fixtures de integracion.** Solo se cambio la preparacion, ninguna asercion; `lot` unico con
  `randomUUID` alli donde una empresa siembra varios lotes, y `purchaseDate` fijo `2026-09-01`:
  - `tests/integration/inventario/company-scope-queries.int.test.ts` (`sembrarLote`, `loteNuevo`)
  - `tests/integration/inventario/product-batch-write.int.test.ts` (`newBatch` con `purchaseDate` por
    defecto; el caso `:368-383` se deja para T8)
  - `tests/integration/inventario/company-scope.int.test.ts` (`:466`)
  - `tests/integration/inventario/list-query-products.int.test.ts`
  - `tests/integration/inventario/presentation-uniqueness.int.test.ts`
  - `tests/integration/inventario/presentation-unit.int.test.ts`
  - `tests/integration/recetas/recetas-constraints.int.test.ts` (`:944`)
  - `tests/integration/unidades/unidades-constraints.int.test.ts`
- **Tres `INSERT` crudos que el typecheck no marcaba y habria que arreglar igual:**
  - `product-batch-write.int.test.ts:429`: sin el cambio daba 23502 donde el test espera 23514,
    porque Postgres comprueba el NOT NULL antes que el CHECK.
  - `company-scope.int.test.ts:680`: sin el cambio fallaba con 23502.
  - `company-scope.int.test.ts:325`: sin el cambio seguia en verde, pero con el 23502 saliendo por
    `lot` y no por `company_id`, que es lo que prueba.
  
  No se tocaron `:380`, `:414` ni `:443`: el disparador de empresa rechaza antes y el archivo pasa. La
  busqueda de `productBatch.create|createMany|upsert` e `INSERT INTO product_batches` en `tests/**`,
  `scripts/**`, `db/**` y `e2e/**` no encuentra ningun otro.
- `e2e/aislamiento-inventario.spec.ts`: **la excepcion acotada**, y nada mas. Diff completo,
  verificado por el implementer:
  ```diff
  @@ -214,6 +214,10 @@ async function seedCompanyInventory(input: {
         companyId: company.id,
         stock: 10,
         unitCost: '3.5000',
  +      // QC-81, excepcion acotada a su R29 aprobada el 2026-09-15: lote y fecha de compra pasaron a
  +      // ser obligatorios en el esquema; solo se completa esta preparacion, el recorrido no cambia.
  +      lot: `E2E-${RUN_ID}`,
  +      purchaseDate: new Date('2026-09-01T00:00:00Z'),
       },
  ```
  `RUN_ID` ya existia (un `randomUUID` unico por corrida). El E2E **no** se ejecuto.
- `tests/guards/guard-identificador-de-request.test.ts`: la migracion de QC-81 entra en
  `MIGRACIONES_ESPERADAS`, con su comentario.
- `tests/unit/inventario/qc81-alcance.test.ts` (nuevo, T11). `E2E_TOLERADO =
  'e2e/aislamiento-inventario.spec.ts'` lleva el comentario con la decision del 2026-09-15. Mide contra
  el merge-base con `origin/dev` primero y `dev` despues, porque el `dev` local va por detras y
  arrastraria el trabajo de QC-95. Fuera de la rama de QC-81 se salta con un aviso; en la rama, si no
  puede calcular la base, da rojo.

**Salida real**
```
$ pnpm run typecheck      (con el T6 del agente A ya en disco)
> tsc --noEmit
(cero errores en todo el repo)
$ pnpm run lint   -> exit 0
$ pnpm exec vitest run --project integration <los 6 fixtures que siembran sin pasar por el adaptador>
test-db: la corrida de integracion va contra qct_qc81_75ea7fee_mu2utj26_lns (copia de qct_tpl_92d13dc6eb14).
 Test Files  6 passed (6)
      Tests  94 passed (94)
test-db: borrada la base de la corrida: qct_qc81_75ea7fee_mu2utj26_lns.
$ pnpm exec vitest run tests/unit/inventario/qc81-alcance.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)          (0 skipped: en esta rama midieron de verdad)
$ pnpm exec vitest run guard
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
```

**Notas para el reviewer**
1. `tasks.md` T11 y R29 en `requirements.md` siguen diciendo «cero archivos bajo `e2e/**`». **No se
   han editado**, por instruccion expresa del leader. La enmienda esta en la seccion DECISION de esta
   bitacora, en `progress/current.md` y en el issue.
2. El caso R31 «products.stock se sigue escribiendo como lo dejo QC-90» busca el texto
   `stock: product.stock ?? null` dentro de `createWithFirstBatch`. Si alguien mueve esa escritura a un
   helper se pone rojo con un mensaje explicito, y habra que juzgar si es regresion o refactor.
3. R32 revisa ademas los metodos del puerto `ProductRepository`, no solo el contrato.
4. La mordida se demuestra con diffs sinteticos (otro archivo bajo `e2e/` da rojo; el tolerado solo,
   verde). No se creo ningun archivo real en carpetas prohibidas para probarlo.

## Rojos abiertos al cerrar las tandas 1 y 2 (los tres quedan cerrados por las tandas 3a y 3b)

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

### Tanda 3c — T8, integracion contra base real con la carrera · `backend_dev`

**Archivos**
- `tests/integration/inventario/product-batch-lot.int.test.ts` (nuevo, 14 casos).
- `tests/integration/aislamiento.json`: entrada nueva en `commit` para
  `inventario/product-batch-lot.int.test.ts`, con `motivo` y `desde: 2026-09-15`.
- `tests/integration/inventario/product-batch-write.int.test.ts`: el caso «deja lot y expiry_date en
  NULL cuando no vienen» se parte en dos, como pide design §0.2 fila 10:
  - «deja expiry_date en NULL cuando no viene»;
  - «QC-81 R8, R9: escribe el lot ausente con el correlativo generado, no NULL».
- `tests/unit/recetas-ui/recipe-route-contract.test.ts`: la migracion de QC-81 entra en
  `DB_PERMITIDAS`, con el formato de la de QC-23. Cierra el rojo de «la feature no toca
  lib/modules/recetas ni db/».

**Metodo del caso 10: el SQL REAL de disco, no reimplementado**
1. Se crea un esquema de usar y tirar con `CREATE TABLE ... (LIKE public.product_batches INCLUDING
   DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`.
2. Se renombra el indice unico de la copia a `product_batches_company_lot_unique`: `LIKE` no conserva
   los nombres de indice y el `down.sql` no lo encontraria.
3. Se comprueba que la copia es fiel al estado migrado.
4. Con `search_path` solo a ese esquema, se ejecuta `down.sql` leido de disco.
5. Se siembra, se ejecuta `migration.sql` leido de disco en una sola transaccion y se afirma.
6. En `finally`, `DROP SCHEMA ... CASCADE`.

`public.product_batches` no se bloquea ni se escribe.

**Salida real**
```
$ pnpm run typecheck -> exit=0      $ pnpm run lint -> exit=0
$ pnpm exec vitest run --project integration tests/integration/inventario/
test-db: la corrida de integracion va contra qct_qc81_75ea7fee_mu2vuwjs_hrw (copia de qct_tpl_92d13dc6eb14).
 Test Files  11 passed (11)
      Tests  135 passed (135)
test-db: borrada la base de la corrida: qct_qc81_75ea7fee_mu2vuwjs_hrw.
$ pnpm exec vitest run tests/unit/recetas-ui/recipe-route-contract.test.ts tests/unit/inventario/qc81-alcance.test.ts
 Test Files  2 passed (2)
      Tests  40 passed (40)
$ pnpm exec vitest run guard
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
```

**La carrera MUERDE: mutacion hecha por el implementer, no razonada**

Hecho con copia en el scratchpad y restauracion con `cp`, como pide `docs/verification.md > Probar que
muerde`. En `product-prisma.ts:610` se sustituyo `SELECT pg_advisory_xact_lock(` por
`SELECT num_nonnulls(`, que evalua los mismos argumentos **sin tomar el lock**, y se corrio solo el
archivo nuevo:
```
test-db: la corrida de integracion va contra qct_qc81_75ea7fee_mu2vz6ai_i28 (copia de qct_tpl_92d13dc6eb14).
     × R14, R15: 3 rondas de 8 altas con Promise.all resuelven todas, sin excepcion, sin reintentos y con lotes consecutivos 709ms
Error: no se pudo escribir un lote generado sin chocar con el indice unico (company_id, lot): empresa 5d1fc4e1-..., ultimo lote intentado '4', 3 intentos
Caused by: PrismaClientKnownRequestError:
Serialized Error: { code: 'P2002', meta: { modelName: 'ProductBatch', target: [ 'company_id', 'lot' ] }, clientVersion: '6.19.3', batchRequestIdx: undefined }
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```
Tras restaurar, `git diff lib/` sale vacio y el archivo vuelve a verde (ver abajo). La salida demuestra
tres cosas:
1. **Sin el lock, R14 cae** y el test lo detecta.
2. El `P2002` **real** de Prisma 6.19.3 trae `target: ['company_id', 'lot']`: queda confirmada contra
   base la decision de reconocer el duplicado por columnas (Tanda 3a).
3. El reintento acotado de R15 **no** tapa la carrera: con 8 altas simultaneas se agota y falla ruidoso,
   con contexto y `cause`.

**Notas para el reviewer**
1. R16: la serie se lleva a `3` generando tres lotes, luego se teclea `'50'` y el siguiente es `'51'`.
   El requisito dice «iba por 7»; se afirma lo mismo con menos altas.
2. Los casos 4 y 7 espian `prisma.$transaction`: 1 llamada por intento en el 4, y exactamente 8 por
   ronda en el 7. «Sin reintento» queda medido, no deducido.
3. Casos 6 y 9: SQL crudo por `pg`, afirmando sobre los campos estructurados `code` y `constraint`,
   nunca sobre el texto del mensaje.
4. Observacion ajena, no tocada: `inventario/product-batch-write.int.test.ts` esta censado como
   `transaccion`, pero la mayoria de sus casos committean, como dice su cabecera; la guardia no lo
   comprueba a proposito (`docs/verification.md`). El design §8 lo citaba como precedente de `commit`.

### Correcciones de la revision (m2, m4, m5 y m6) · `backend_dev` · 2026-09-15

El reviewer aprobo (0 mayores, 6 menores) y el humano decidio el 2026-09-15 corregirlos antes del PR.
A la implementacion le tocan m2, m4, m5 y m6. m1, m3 y el reflejo de m4 en el spec son del
spec_author. Informe de la revision: `progress/review_QC-81-lote-y-fecha-de-compra.md > 6`.

**Aviso de lectura.** Las secciones anteriores de esta bitacora que hablan de `'^[0-9]{1,18}$'` o de
`max(("lot")::bigint)` (Tanda 1, Tanda 3a) **describen el estado previo a m4** y quedan superadas por
esta seccion. En la Tanda 1, «un lote de 25 digitos queda intacto y no revienta» sigue siendo cierto,
pero ahora el relleno **continua** desde el.

**m2. `tests/unit/inventario/schema/inventario-schema.test.ts`.** La cabecera del bloque dice ahora
«ACTUALIZADO EL 2026-09-15» y nombra las dos inversiones como **aprobadas explicitamente por el humano
el 2026-09-15**. Cita la afirmacion ademas del numero de linea, porque las lineas se han movido:
- `:433`, hoy `:436`: `lot.isOptional === false`;
- `:1111`, hoy hacia `:1165`: `@@unique([companyId, lot], map: "product_batches_company_lot_unique")`.

No cambia ninguna asercion.

**m4. La serie sin techo.** El maximo se lee con `numeric` y no con `bigint`, y sin cota de digitos:
- `resolveLot` (`product-prisma.ts`) ejecuta `SELECT max(("lot")::numeric)::text AS "top" ... AND "lot" ~ '^[0-9]+$'`;
  la suma sigue siendo `BigInt(top) + 1` sobre el texto, sin `Number(`.
- El relleno de `migration.sql`, paso 4, usa `max(("lot")::numeric) AS top ... WHERE "lot" ~ '^[0-9]+$'`.
  Cambiar el SQL estaba permitido porque la migracion aun no ha llegado a `dev`.
- **Ceros a la izquierda y decimales.** Medido contra base efimera: `max(x::numeric)` sobre `'007'`,
  `'0999999999999999999'` y `'42'` da `"999999999999999999"`, sin ceros ni decimales, asi que `'007'`
  sigue contando como 7 y el siguiente es `'8'`.
- **Tests de esquema al dia.** `product-batch-lot-migration.test.ts` exige `::numeric`, rechaza
  `::bigint` y cualquier cota `{n,m}`, y lleva dos mutaciones sinteticas (`conCota`, `conBigint`) que
  dan `false`. `product-batch-lot-retry.test.ts` no afirmaba sobre el texto del SQL y no cambia.
- **Huella de migraciones.** Cambio, y la plantilla se reconstruyo sola sobre bases temporales, sin
  tocar `QuimiCloude`:
  `test-db: no hay plantilla para esta huella de migraciones. Construyendo qct_tpl_a365fb82c2bf` (antes `qct_tpl_92d13dc6eb14`).
- **Tests nuevos** en `tests/integration/inventario/product-batch-lot.int.test.ts`:
  - «R16: con "999999999999999999" tecleado a mano el siguiente es "1000000000000000000" y el siguiente "1000000000000000001", sin techo y sin chocar».
    Espia `$transaction` (1 por alta, sin reintento) y comprueba que ningun lote generado existia antes.
    Con el codigo anterior, la segunda alta agotaba los 3 intentos.
  - «R18: el relleno continua SIN TECHO desde un lote de 18 o mas digitos, sin chocar con uno de 19 ya escrito y sin reventar con uno de 40».
    Es un escenario del caso 10, con el SQL real de disco. Una de las empresas era justo el caso en que
    la cota antigua habria abortado la migracion por el indice unico.

**Limite conocido nuevo, medido y no resuelto (para `design.md §9`).** El CHECK
`product_batches_lot_length` (60 caracteres) pone un techo a la serie. Se midio con un bloque temporal
contra base efimera, que despues se borro del archivo:
- **En el alta:** si el maximo numerico de una empresa son 60 nueves, el siguiente generado tendria 61
  caracteres. El `INSERT` lo rechaza con `23514 product_batches_lot_length`, que llega como
  `PrismaClientUnknownRequestError` **crudo** (ni `ValidationError` ni `BatchDuplicateLotError`). El
  borde lo devuelve como `unexpected`. Es ruidoso, abre una sola transaccion y no escribe nada, pero
  **bloquea para siempre los lotes generados de esa empresa**. Las altas con lote a mano siguen
  funcionando.
- **En la migracion:** con 60 nueves y una fila sin lote en la misma empresa, el relleno escribe 61
  caracteres y la migracion aborta **entera** al crear el CHECK, con el mensaje generico «violada por
  alguna fila». No deja nada a medias. Con la cota antigua ese lote se ignoraba y la fila recibia `'1'`.
  Es el mismo tipo de fallo que la desviacion 5 de la Tanda 1 para lotes de mas de 60 caracteres.
- No se invento ninguna salida para este caso. Queda anotado en el docblock de `resolveLot` y en el
  comentario del SQL. La decision de si se acepta como limite o se trata es del leader y del spec_author.

**m5. El test de la carrera ya no oculta su causa.**
- En el `it` «R14, R15: 3 rondas de 8 altas con Promise.all resuelven todas, sin excepcion, sin
  reintentos y con lotes consecutivos», cada ronda se espera con `Promise.allSettled` y se relanza el
  **primer** rechazo tal cual, antes de afirmar y antes de la limpieza. Las afirmaciones no cambian.
- **Comentario nuevo:** el test solo tiene sentido con un pool de Prisma de mas de una conexion. Con
  `connection_limit=1` las altas se serializarian en el pool y pasaria sin lock.
- **Nombre del `it`.** Se deja «con Promise.all», para no romper las referencias del mapa y de la
  revision. Las altas se siguen lanzando a la vez.
- **La mutacion muerde con la causa real.** Se repitio (lock por `num_nonnulls`, copia y restauracion
  con `cp`, y `git diff lib/` identico antes y despues). Salida literal:
  ```
  × R14, R15: 3 rondas de 8 altas con Promise.all resuelven todas, sin excepcion, sin reintentos y con lotes consecutivos 209ms
  Error: no se pudo escribir un lote generado sin chocar con el indice unico (company_id, lot): empresa d587ad9a-..., ultimo lote intentado '4', 3 intentos
   ❯ writeBatchWithLotRetry lib/modules/inventario/adapters/driven/persistence/product-prisma.ts:917:9
   ❯ tests/integration/inventario/product-batch-lot.int.test.ts:533:27
  Caused by: PrismaClientKnownRequestError: ... Unique constraint failed on the fields: (`company_id`,`lot`)
   Test Files  1 failed (1)
        Tests  1 failed | 15 passed (16)
  ```
  No aparece ninguna FK de la limpieza.

**m6.** En el docblock general de `ProductBatch` (`db/schema.prisma:642`), «su numero de lote (`lot`,
OPCIONAL)» pasa a «su numero de lote (`lot`)».

**Salida real**
```
$ pnpm run typecheck -> EXIT=0          $ pnpm run lint -> EXIT=0
$ pnpm exec vitest run tests/unit/inventario/schema/ tests/unit/inventario/product-batch-lot-retry.test.ts   (repetido por el implementer)
 Test Files  9 passed (9)
      Tests  137 passed (137)
$ pnpm exec vitest run --project integration tests/integration/inventario/
test-db: la corrida de integracion va contra qct_qc81_75ea7fee_mu2yervh_c8w (copia de qct_tpl_a365fb82c2bf).
 Test Files  11 passed (11)
      Tests  137 passed (137)
test-db: borrada la base de la corrida: qct_qc81_75ea7fee_mu2yervh_c8w.
$ pnpm exec vitest run guard
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
$ pnpm exec vitest run tests/unit/inventario/qc81-alcance.test.ts
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

**Lo que m4 deja obsoleto en el spec (para el spec_author; aqui no se toca `specs/**`)**
1. **`design.md §2.3` («El relleno del lote, escrito»).**
   - El bloque SQL dice `max(("lot")::bigint)` y `'^[0-9]{1,18}$'`; hoy es `max(("lot")::numeric)` y `'^[0-9]+$'`.
   - La viñeta «`'^[0-9]{1,18}$'` acota a lo que cabe en `bigint`: sin la cota, un lote de 40 dígitos...
     reventaría el `::bigint` con un `22003`» deja de ser cierta: no hay cota, y un lote de 40 digitos
     entra en la serie.
2. **`design.md §3.2`, paso 2.** Dice `SELECT max(("lot")::bigint) ... '^[0-9]{1,18}$'`; hoy es
   `max(("lot")::numeric)::text` con `'^[0-9]+$'`, y la suma se hace en `BigInt` sobre el texto.
3. **`design.md §9` («Límites conocidos»).**
   - Falta el limite nuevo de los 60 nueves, descrito arriba.
   - Los dieciocho nueves (m4) **no** entran como limite: quedan resueltos.
   - El punto 3 (el «9000» salta la serie) sigue siendo cierto, ahora sin techo: un lote de 40 digitos
     tecleado salta la serie a 40 digitos.
4. **`design.md §8`, parrafo de la carrera.** Habla de «dos `createWithFirstBatch` con `Promise.all`».
   El test son 3 rondas de 8, que ahora esperan con `Promise.allSettled` y relanzan el primer rechazo.
   Tampoco dice que el test exige un pool de mas de una conexion.
5. **`tasks.md:102` (T6):** «el máximo sobre `'^[0-9]{1,18}$'`».
6. **Siguen con el texto previo**, que no se editan desde aqui: `progress/review_QC-81-lote-y-fecha-de-compra.md:79-80`
   y los tramos historicos de esta bitacora señalados en el aviso de lectura.

**Adenda al mapa R -> test (final).** Se suman los dos `it` nuevos de m4, sin quitar nada:
- **R16:** «R16: con "999999999999999999" tecleado a mano el siguiente es "1000000000000000000" y el siguiente "1000000000000000001", sin techo y sin chocar».
- **R18:** «R18: el relleno continua SIN TECHO desde un lote de 18 o mas digitos, sin chocar con uno de 19 ya escrito y sin reventar con uno de 40».
- **R14:** el mismo `it`, con `Promise.allSettled` (m5).

### Tanda 6 — T13 y T14, enmienda D13 · `backend_dev` · 2026-09-15

El humano aprobo la enmienda del spec el 2026-09-15 (commit `c697bc0`): D13, R34-R36, `design.md §4.6`
y §6 E/F. **Tasks cerradas aqui: T13 y T14.** Marcarlas `[x]` en `tasks.md` lo hace el leader al juntar
este commit con la edicion del spec_author: desde la implementacion no se edita `tasks.md`. **T15
queda CANCELADA** (P1 cerrada con D: no hay datos previos, asi que la migracion no lleva guardia) y
no se ha implementado.

**Archivos (solo estos 5)**
- `lib/modules/inventario/domain/product-batch-input.ts` (T13).
  - Se añaden dos constantes **no exportadas**, cada una con su docblock:
    `NUMERIC_LOT_PATTERN = /^[0-9]+$/`, que remite a `'^[0-9]+$'` de `resolveLot` y del relleno, y
    `MESSAGE_LOTE_NUMERICO_LARGO = 'Un lote de solo números puede tener hasta 59 caracteres.'`.
  - `lotSchema` queda como
    `z.string().trim().min(1).max(PRODUCT_BATCH_LOT_MAX_LENGTH, { abort: true }).refine(v => !(NUMERIC_LOT_PATTERN.test(v) && v.length >= PRODUCT_BATCH_LOT_MAX_LENGTH), { message })`,
    con un docblock que cita D13, R34, R35, R36 y el porque de `abort: true`.
  - **Ningun export nuevo** (verificado en el diff por el implementer).
- `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (T13, **solo el comentario**).
  El «LIMITE CONOCIDO» de `resolveLot` dice ahora que el `23514` sale `unexpected` sin traducir
  (§6 F), que desde R34 solo lo alcanzan datos ya escritos o escritos por otra via, y que P1 se cerro
  con D.
- `tests/unit/inventario/product-batch-input.test.ts` (T13): bloque «QC-81 D13», 7 casos.
- `tests/unit/inventario/create-product.test.ts` (T13): bloque «QC-81 R34», 1 caso.
- `tests/integration/inventario/product-batch-lot.int.test.ts` (T14): 1 caso con los 4 pasos, por el
  caso de uso con el repositorio real y una empresa propia.

Sin `CHECK` en la base, sin traducir el `23514` y sin tocar la migracion ni `app/**`.

**Salida real**
```
$ pnpm run typecheck -> EXIT=0          $ pnpm run lint -> EXIT=0
$ pnpm exec vitest related --run lib/modules/inventario/domain/product-batch-input.ts lib/modules/inventario/adapters/driven/persistence/product-prisma.ts --project node --project ui
 Test Files  131 passed (131)
      Tests  2033 passed | 1 skipped (2034)
$ pnpm exec vitest run tests/unit/inventario/module-contract.test.ts tests/unit/inventario/qc81-alcance.test.ts
 Test Files  2 passed (2)
      Tests  19 passed (19)
$ pnpm exec vitest run guard
 Test Files  39 passed (39)
      Tests  407 passed | 9 skipped (416)
$ pnpm exec vitest run --project integration tests/integration/inventario/product-batch-lot.int.test.ts
test-db: la corrida de integracion va contra qct_qc81_75ea7fee_mu305liw_jdo (copia de qct_tpl_a365fb82c2bf).
 ✓ ... > R35, R36, R34: por el caso de uso, 59 nueves tecleados se escriben, los dos siguientes generados tienen 60 caracteres sin reintento y 60 digitos tecleados dan ValidationError sin filas nuevas 33ms
 Test Files  1 passed (1)
      Tests  17 passed (17)
test-db: borrada la base de la corrida: qct_qc81_75ea7fee_mu305liw_jdo.
```

**La regla muerde (mutacion con copia y restauracion, `cmp` identico).** Con el `refine` desactivado
(`(value) => true || ...`):
```
--- MUTANTE: unit ---
 FAIL ... R34: con un lote de 60 digitos lanza ValidationError (invalid_input) y el repositorio recibe cero llamadas
 FAIL ... R34: 60 digitos se rechazan con UN solo issue en lot, de codigo custom y con su mensaje
 FAIL ... R34: 60 digitos con ceros a la izquierda se rechazan igual (cuenta caracteres, no magnitud)
 FAIL ... R34: 60 digitos rodeados de espacios se rechazan, porque cuenta el valor recortado
      Tests  4 failed | 74 passed (78)
--- MUTANTE: integration ---
 FAIL |integration| ... R35, R36, R34: por el caso de uso, 59 nueves tecleados se escriben, ...
AssertionError: expected null to be an instance of ValidationError
RESTAURADO identico
```
El `abort: true` no tiene mutacion propia. Lo cubre el caso de 61 digitos, que afirma **un solo** issue
y de codigo `too_big`.

**Tests por requisito**
- **R34:**
  - `product-batch-input.test.ts`:
    - «R34: 60 digitos se rechazan con UN solo issue en lot, de codigo custom y con su mensaje»
    - «R34: 60 digitos con ceros a la izquierda se rechazan igual (cuenta caracteres, no magnitud)»
    - «R34: 60 digitos rodeados de espacios se rechazan, porque cuenta el valor recortado»
    - «R34: 61 digitos cobran UN solo issue, el del largo, y no tambien el de solo digitos»
  - `create-product.test.ts`: «R34: con un lote de 60 digitos lanza ValidationError (invalid_input) y el repositorio recibe cero llamadas».
  - `product-batch-lot.int.test.ts`: el caso de T14, paso 4 (cero `$transaction` y cero filas nuevas).
- **R35:**
  - `product-batch-input.test.ts`: «R35: 59 digitos se aceptan y llegan tal cual» y «R35: 60 caracteres con una letra o un guion se aceptan y llegan tal cual».
  - El caso de T14, paso 1.
- **R36:** el caso de T14, pasos 2 y 3. Genera `'1' + 59 ceros` y luego `'1' + 58 ceros + '1'`, los dos
  de 60 caracteres, con una sola `$transaction` por alta.
- **R8, sin regresion:** «R8: el lote ausente o en null sigue siendo valido (sin regresion por la regla nueva)».

**La pantalla: por lectura de codigo, no por test.** Se comprobo sin tocar `app/**`:
- `product-form.tsx:309-318` valida con `createProductWithFirstBatchSchema` antes de llamar a la
  operacion.
- `:327-332` reparte los issues por `issue.path[0]`, y `lot` esta en `FIELD_MESSAGES`.
- `fieldMessage` (`:198-208`) devuelve `issue.message` para los issues `custom`, que es el caso de `lot`.
- `:573` pasa `error={fieldErrors.lot}`, y `product-field.tsx:120-122` lo pinta con `aria-invalid` y
  `aria-describedby`.

Con 60 digitos el campo del lote muestra «Un lote de solo números puede tener hasta 59 caracteres.»;
con 61, el generico «Escribe un lote de 1 a 60 caracteres.», que para ese caso es cierto. **Ningun
test de UI afirma el mensaje de `lot`**: los usos de `lot` en `product-page.test.tsx` son para otras
cosas. Si se quiere cubrir, seria un caso en `product-page.test.tsx`, que encaja en QC-103 o donde
decida el leader. Aqui no se escribieron tests de UI.

**Observacion para el spec_author (no tocado).** El comentario de
`db/migrations/20260913120000_product_batch_lot_and_purchase_date/migration.sql:163-164` («LIMITE
CONOCIDO: si una empresa ya tiene un lote de 60 nueves, su siguiente correlativo tendria 61
caracteres y el CHECK product_batches_lot_length aborta la migracion ENTERA.») **no es falso**:
habla de datos ya escritos. Pero **esta incompleto** frente al spec enmendado, porque no cita D13 ni
R34 ni dice que P1 se cerro con D. La variante D de la T15 cancelada preveia cambiarlo; como la
migracion no se toca, se queda asi y lo decide el leader o el spec_author.

**Adenda al mapa R -> test (final): R34-R36.** Los tests de arriba se suman al mapa sin quitar nada, y
con ellos queda **R1..R36 sin ningun requisito huerfano**:

| R | Test(s) |
|---|---|
| R34 | `product-batch-input.test.ts`: los cuatro `it` «R34: ...»; `create-product.test.ts` «R34: con un lote de 60 digitos lanza ValidationError (invalid_input) y el repositorio recibe cero llamadas»; `product-batch-lot.int.test.ts` «R35, R36, R34: por el caso de uso, 59 nueves tecleados se escriben, los dos siguientes generados tienen 60 caracteres sin reintento y 60 digitos tecleados dan ValidationError sin filas nuevas» (paso 4) |
| R35 | `product-batch-input.test.ts` «R35: 59 digitos se aceptan y llegan tal cual» y «R35: 60 caracteres con una letra o un guion se aceptan y llegan tal cual»; el mismo `it` de integracion (paso 1) |
| R36 | el mismo `it` de integracion (pasos 2 y 3) |

## Estado final de F2.1

| Task | Estado |
|---|---|
| T0 | [x] `batch_duplicate_lot` aprobado por el humano (F1.4, 2026-09-15) |
| T1 | [x] migracion verificada: base de desarrollo aplicada y revertida, base vacia, filas sembradas |
| T2 | [x] esquema; typecheck en verde en todo el repo |
| T3 | [x] test de esquema y de migracion |
| T4, T5 | [x] entrada y caso de uso |
| T6 | [x] correlativo, lock, reintento y rechazo del duplicado a mano (por columnas) |
| T7 | [x] contrato: solo reexporta `BatchDuplicateLotError`; puertos sin cambio |
| T8 | [x] 14 casos contra base real; la carrera muerde sin el lock |
| T9 | [x] sexta enmienda al catalogo |
| T10 | [x] `purchaseDate` en la Server Action |
| T11 | [x] limites de alcance, con la excepcion del E2E |
| T12 | [ ] mapa hecho (abajo); **falta el gate completo, que corre el leader** |

**Base de desarrollo compartida:** revertida desde la tanda 1 y **no se ha vuelto a migrar**. Toda la
integracion corrio sobre bases temporales `qct_qc81_*`, ya borradas.

## Mapa R1..R33 -> test (final)

Rutas relativas al worktree. `lot-int` = `tests/integration/inventario/product-batch-lot.int.test.ts`;
`mig` = `tests/unit/inventario/schema/product-batch-lot-migration.test.ts`; `schema` =
`tests/unit/inventario/schema/inventario-schema.test.ts`; `cp` = `tests/unit/inventario/create-product.test.ts`;
`input` = `tests/unit/inventario/product-batch-input.test.ts`; `retry` =
`tests/unit/inventario/product-batch-lot-retry.test.ts`; `actions` =
`tests/unit/inventario/product-actions.test.ts`; `alcance` = `tests/unit/inventario/qc81-alcance.test.ts`.

| R | Test(s) |
|---|---|
| R1 | `schema`: `purchaseDate.isOptional === false` y `@db.Date` sin `@default`; `lot-int` «R20: con la tabla vacia la migracion aplica sin error y deja NOT NULL, los dos CHECK y el indice unico» |
| R2 | `cp` «pasa al puerto la fecha civil UTC del now inyectado, y el MISMO instante como now»; `input` «acepta el alta sin purchaseDate, ausente o en null (ausente = hoy, lo resuelve el caso de uso)»; `actions` «sin purchaseDate en el FormData, o vacia, llega undefined para que el caso de uso ponga hoy (R2)»; `lot-int` «R3, R2: por el caso de uso, sin fecha llega el dia UTC del now inyectado y con fecha llega la escrita» |
| R3 | `lot-int` «R3: una fecha escrita llega identica a purchase_date, por los dos caminos del adaptador»; `cp` «pasa tal cual una fecha de la semana pasada»; `actions` «hace llegar purchaseDate al caso de uso tal cual, como la cadena civil escrita (R2, R3)» |
| R4 | `cp` «rechaza la fecha de manana con ValidationError senalando purchaseDate y cero llamadas al repositorio»; `cp` «decide «futura» contra el dia UTC del now inyectado, no contra el reloj de la maquina» |
| R5 | `cp` «acepta hoy y una fecha de meses atras sin corregirlas» |
| R6 | `input` «rechaza la fecha sin forma YYYY-MM-DD con un solo issue en purchaseDate»; `input` «rechaza la fecha con forma correcta que no existe en el calendario»; `cp` «rechaza el alta con una fecha de compra sin forma YYYY-MM-DD (QC-81 R6)» / «... que no existe (QC-81 R6)» |
| R7 | `lot-int` «R7: lot = "" y lot = "   " los rechaza product_batches_lot_not_blank (23514) y lot = NULL da 23502»; `schema` `lot.isOptional === false`; `mig` «R7, R11 y R22...» |
| R8 | `lot-int` «R8, R9: empresa sin lotes, el alta con lot ausente genera "1" y la siguiente "2"»; `lot-int` «R8, R9: por el camino de lote a producto existente (addBatchToAlive) tambien genera "1" y "2"»; `cp` «pasa lot null al puerto -«generalo»- cuando el lote no viene...»; `product-batch-write.int.test.ts` «QC-81 R8, R9: escribe el lot ausente con el correlativo generado, no NULL» |
| R9 | `lot-int` (los dos de R8) y «R9: "ACME-2026-07" no altera la serie y "007" cuenta como 7, asi que el siguiente es "8" sin ceros» |
| R10 | `cp` «pasa el lote escrito tal cual, recortado, sin sustituirlo -QC-81 R10-»; `retry` «no reintenta, no pide lock ni maximo, y sale BatchDuplicateLotError»; `lot-int` caso R13 (sin lote sustituto) |
| R11 | `lot-int` «R11: un duplicado dentro de la empresa por SQL crudo lo rechaza product_batches_company_lot_unique con 23505»; `schema` `@@unique([companyId, lot], map: "product_batches_company_lot_unique")` |
| R12 | `lot-int` «R12, R27: dos empresas escriben el MISMO lote, y B sin lotes genera "1" aunque A tenga "50"»; `schema` «ninguna unicidad GLOBAL de lote (R12)» |
| R13 | `lot-int` «R13, R25: rechaza con BatchDuplicateLotError (batch_duplicate_lot), sin reintentar ni sustituir y con cero filas escritas»; `retry` «con lote escrito a mano no reintenta y sale BatchDuplicateLotError»; `tests/unit/errores/catalogo.test.ts` «batch_duplicate_lot esta en el catalogo con su clave y su texto exacto» y «se distingue de invalid_input y de duplicate_number»; `actions` «entrega batch_duplicate_lot al llamante con el texto del catalogo, como los demas codigos (R13)» |
| R14 | `lot-int` «R14, R15: 3 rondas de 8 altas con Promise.all resuelven todas, sin excepcion, sin reintentos y con lotes consecutivos», con la **mutacion sin lock en rojo** (arriba) |
| R15 | `retry` «reintenta en una transaccion nueva, con maximo nuevo, y a la segunda escribe», «se para en 3 intentos y lanza un Error con empresa, ultimo lote e intentos, con el choque como cause», «un P2002 ajeno se relanza tal cual y sin reintentar», «es falso con P2002 sobre otras columnas»; mutacion sin lock: el `Error` con contexto real |
| R16 | `lot-int` «R16: con "50" tecleado a mano cuando la serie iba por 3, el siguiente generado es "51" y nunca uno existente» |
| R17 | `mig` «R17: existe exactamente UNA migracion...» y «R17: el down quita indice, CHECK, NOT NULL de lot y purchase_date, en orden inverso»; `lot-int` caso 10, que ejecuta el `down.sql` real |
| R18 | `lot-int` «R18, R19: numera las filas sin lote por orden de creacion y por empresa desde el maximo, conserva los lotes y pone el dia UTC de created_at»; `mig` «R18: el relleno de lote numera por empresa...» |
| R19 | `lot-int` (el de R18); `mig` «R19 y R26: purchase_date nace DATE anulable sin DEFAULT y se rellena con created_at en UTC» |
| R20 | `lot-int` «R20: con la tabla vacia la migracion aplica sin error y deja NOT NULL, los dos CHECK y el indice unico»; ademas, la plantilla de QC-77 se construye con esta migracion sobre `product_batches` vacia (Tanda 1) |
| R21 | `lot-int` «R21: con dos filas de la misma empresa y el mismo lote la migracion aborta con su mensaje y no deja nada a medias»; `mig` «R21: la guardia de duplicados por empresa va antes de todo cambio...» |
| R22 | `mig`: parentesis de RLS, «cada relleno comprueba su ROW_COUNT», «los rellenos van ANTES de los SET NOT NULL», «los dos CHECK y el indice unico van DESPUES del relleno», «no abre ni confirma transacciones propias»; `lot-int` R21, que no deja nada a medias |
| R23 | `mig` «R23: el down no contiene ningun UPDATE que vacie lot, y su cabecera dice lo que pierde»; prueba real de la Tanda 1 (el DOWN no vacio ningun lote en 15 filas) |
| R24 | `cp` «rechaza a un actor %s con UnauthorizedError sin llamar al reloj ni al puerto» (x4) |
| R25 | `lot-int` «R13, R25: ... con cero filas escritas»; `retry` «reintenta en una transaccion nueva...» |
| R26 | `mig` «R26: sin borrado, sin marcas de tiempo, sin otras tablas e identificadores en ingles»; `schema` (`purchaseDate` `DateTime @db.Date`) |
| R27 | `lot-int` «R12, R27: ... B sin lotes genera "1" aunque A tenga "50"»; `tests/guards/guard-ambito-empresa-inventario.test.ts` «product-prisma.ts: toda funcion que toca la base declara y consume el ambito»; `tests/unit/inventario/company-scope.test.ts` «solo `company-scope.ts` escribe `companyId: scope.companyId`» |
| R28 | `alcance` «R28: el diff de la rama no trae ningun archivo bajo app/ ni components/» y «R28: el detector muerde con app/ y components/, y no con lo que solo se les parece» |
| R29 | `alcance` «R29: bajo e2e/ el diff trae como mucho exactamente el spec tolerado», «R29: un diff sintetico con otro archivo bajo e2e/ da rojo», «R29: un diff sintetico con solo el archivo tolerado (o sin e2e) da verde» (excepcion acotada del 2026-09-15; ver DECISION) |
| R30 | `alcance` «R30: el diff de la rama no toca package.json ni pnpm-lock.yaml» y «R30: el detector muerde con el manifiesto y con el lock solo, y no con parecidos» |
| R31 | `alcance` «R31: ningun archivo del modulo inventario suma lotes, ajusta ni consume», «R31: products.stock se sigue escribiendo como lo dejo QC-90», y los dos detectores sinteticos |
| R32 | `alcance` «R32: ningun export del contrato publico denota listar, editar ni borrar lotes», «R32: y el puerto de producto tampoco declara ninguna», «R32: el detector muerde con listar, editar y borrar lotes, y no con el alta»; `tests/unit/inventario/module-contract.test.ts` «ningun export del contrato denota listar, editar ni borrar lotes» |
| R33 | `lot-int` entero: correlativo (R8, R9, R16), unicidad por empresa (R11, R12), relleno de la migracion (R18-R21) y altas compitiendo (R14) |

Ningun requisito queda sin test.

**E2E diferido a QC-103, con motivo.** Excepcion consciente a `CHECKPOINTS.md`: esta ficha no tiene
pantalla ni recorrido nuevo que mirar (R29, D11); la verificacion exigida es integracion contra base
real, arriba. El unico cambio bajo `e2e/**` es la preparacion permitida por la excepcion del
2026-09-15, y el E2E no se ejecuto en esta ficha.

## Historico: estado al parar (F2.1 detenida por el bloqueo del E2E, ya resuelto)

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

## Historico: mapa R -> test parcial al parar (sustituido por «Mapa R1..R33 -> test (final)», arriba)

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

**Gate completo (`./init.sh`): PENDIENTE DEL LEADER.** Ni el implementer ni los subagentes corren
`./init.sh` ni la suite completa (`AGENTS.md > Regla del gate`). Los rojos que registraba la seccion
historica de arriba estan todos cerrados.

**Ultima verificacion acotada, hecha por el implementer tras restaurar el adaptador de la mutacion:**
```
$ git diff --quiet lib/ && echo "lib limpio"
lib limpio
$ pnpm exec vitest run --project integration tests/integration/inventario/product-batch-lot.int.test.ts
test-db: la corrida de integracion va contra qct_qc81_75ea7fee_mu2w0hle_l8w (copia de qct_tpl_92d13dc6eb14).
 Test Files  1 passed (1)
      Tests  14 passed (14)
test-db: borrada la base de la corrida: qct_qc81_75ea7fee_mu2w0hle_l8w.
```

Resumen de lo que salio verde, por tanda (comando exacto y salida en cada seccion):
- `pnpm run typecheck`: exit 0 en todo el repo, tras T6 y T8.
- `pnpm run lint`: exit 0.
- `tests/unit/inventario` + `tests/unit/errores`: 37 archivos, 578 tests.
- `vitest run guard`: 39 archivos, 407 pasan y 9 saltados.
- `tests/integration/inventario/`: 11 archivos, 135 tests.
- Los otros archivos de integracion con fixtures tocados: 6 archivos, 94 tests.
- `qc81-alcance` + `recipe-route-contract`: 40 tests.

**Lo que el leader tiene que saber antes de correr el gate:**
1. **`tests/unit/recetas-ui/recipe-route-contract.test.ts`** esta en `tests/baseline-rojos.json`; en
   esta rama su caso de diff ya pasa, con la migracion en `DB_PERMITIDAS`. Si el gate avisa de que
   un archivo del baseline ya pasa, es este y es esperado.
2. **La base de desarrollo compartida sigue sin la migracion de QC-81** (el aviso amarillo de
   «va 1 atras» de `init.sh` 6.c es esperado). Aplicarla es el paso manual cuando la rama entre en
   `dev` y QC-101 haya soltado la base.
3. **El E2E no se ha ejecutado** en esta ficha (excepcion acotada, y QC-101 usa la base).
4. **Deuda anotada, no de QC-81:**
   - la frase «UNICO archivo del modulo que importa `@prisma/client`» en docblocks previos de
     inventario;
   - el censo de `product-batch-write.int.test.ts` como `transaccion`.
