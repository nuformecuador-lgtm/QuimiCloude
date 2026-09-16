# QC-81 — lote-y-fecha-de-compra · tasks.md

> `[P]` = paralelizable con las otras `[P]` de su misma tanda. Cada task declara **los archivos que
> toca** y su criterio de «hecho». Ninguna task se da por hecha sin `./init.sh --rapido` en verde; la
> feature no se cierra sin `./init.sh` completo (`docs/verification.md`).
>
> **Dos cosas que esta ficha NO hace, y que son criterio de rechazo si aparecen:**
> **(a) ningún archivo bajo `app/**` ni `components/**`** (R28 — la pantalla es QC-103), y
> **(b) ningún E2E nuevo** (R29). Si una task acaba pidiendo tocar la pantalla, se para y se anota:
> es señal de que algo se diseñó mal.
>
> **Ninguna dependencia entra** (`design.md > 7.1`, R30). Si alguna task acaba pidiendo una, se
> para y se sube la propuesta; no se instala.
>
> **T0 es bloqueante de todo lo demás**: sin la respuesta del humano, la mitad del manejo de errores
> no se puede escribir sin inventar.

## Tanda 0 — la puerta que no se puede saltar

- [x] **T0 — Confirmar la enmienda del catálogo de errores.**
      Archivos: ninguno todavía.
      `design.md > 7.2` propone `batch_duplicate_lot` como **sexta enmienda** al catálogo cerrado, y
      el propio `error-codes.ts` exige que la apruebe una persona. Se resuelve en la puerta F1.4,
      junto con el spec.
      **Hecho:** hay respuesta escrita —código nuevo **o** plan B (`invalid_input`)— y queda anotada
      en `progress/impl_QC-81-lote-y-fecha-de-compra.md`. Sin ella, T6 y T9 no se empiezan.

## Tanda 1 — la base (es donde vive la garantía)

- [x] **T1 — La migración con su relleno.** Depende de T0 solo para el texto de los comentarios.
      Archivos: `db/migrations/20260913120000_product_batch_lot_and_purchase_date/migration.sql`
      (nuevo), `.../down.sql` (nuevo).
      Los siete pasos **en el orden exacto** de `design.md > 2.1`: paréntesis `NO FORCE` de RLS,
      guardia de lotes duplicados por empresa con su `RAISE EXCEPTION`, las dos columnas anulables,
      los dos rellenos (`design.md > 2.3` para el lote; `("created_at" AT TIME ZONE 'UTC')::date`
      para la fecha), `SET NOT NULL`, los dos `CHECK` y el índice único
      `product_batches_company_lot_unique`, y el cierre `ENABLE`+`FORCE`. Cada `UPDATE` compara su
      `ROW_COUNT` contra el total de la tabla y aborta si no cuadra, copiando QC-49.
      **Escrita a mano**, no con `prisma migrate dev` (motivo en `design.md > 2`).
      **Hecho:** `pnpm run db:migrate` aplica sobre la base de desarrollo; `pnpm run db:rollback`
      revierte y deja `pnpm exec prisma migrate status` limpio; y aplicada sobre una base **vacía**
      no falla (R20 — compruébalo de verdad, es el punto donde el repo ya se quemó con QC-49).
      Cubre **R17, R18, R19, R20, R21, R22, R23** y el lado base de **R7, R11, R12**.

- [x] **T2 — El esquema Prisma al día.** Depende de T1.
      Archivos: `db/schema.prisma` (modelo `ProductBatch`).
      `lot String` (sin `?`), `purchaseDate DateTime @map("purchase_date") @db.Date`, y
      `@@unique([companyId, lot], map: "product_batches_company_lot_unique")` —modelable porque el
      índice no es parcial ni funcional, `design.md > 1.2`—. El docblock del modelo dice qué cambió
      y por qué, citando QC-81.
      **Hecho:** `pnpm exec prisma validate` y `pnpm run typecheck` en verde; el cliente generado
      expone `purchaseDate` obligatorio y `lot` no anulable.

- [x] **T3 [P] — Test de esquema y de migración.** Depende de T1 y T2.
      Archivos: `tests/unit/inventario/schema/product-batch-lot-migration.test.ts` (nuevo),
      `tests/unit/inventario/schema/inventario-schema.test.ts` (**actualización obligada**,
      `design.md > 0.3`).
      El test nuevo lee el SQL y afirma: el paréntesis de RLS abierto **y cerrado**, que el relleno
      va **antes** de los `SET NOT NULL`, que el índice único va **después** del relleno, que la
      guardia de duplicados existe con su mensaje, y que el `down.sql` **no** contiene ningún
      `UPDATE` que vacíe `lot` (R23). En `inventario-schema.test.ts` se añade `purchaseDate` a
      `PRODUCT_BATCH_COLUMNS`, se invierte la afirmación de `lot.isOptional` y se deja escrito por
      qué —igual que QC-80 hizo con la guardia de alcance de QC-90 en ese mismo archivo—.
      **Hecho:** los dos archivos en verde y ningún otro test de esquema rojo. Cubre **R17, R22,
      R23, R26**.

## Tanda 2 — dominio y contratos

- [x] **T4 [P] — Fecha de compra en el esquema de entrada.** Depende de T0 (no), independiente de la
      tanda 1.
      Archivos: `lib/modules/inventario/domain/product-batch-input.ts`,
      `tests/unit/inventario/product-batch-input.test.ts`.
      `purchaseDateSchema`: patrón `YYYY-MM-DD` **más** comprobación de fecha de calendario real
      (`2026-02-30` se rechaza). Se declara `nullish()` —ausente = hoy— y el docblock explica que es
      lo que mantiene la pantalla de hoy funcionando sin tocarla (`design.md > 4.1`). El docblock de
      `lotSchema` se reescribe: opcional en la **entrada**, obligatorio en la **fila**.
      **Hecho:** tests de forma válida, forma inválida, fecha inexistente, campo ausente y campo
      desconocido (sigue siendo `strictObject`). Cubre **R6** y el lado entrada de **R2, R8**.

- [x] **T5 — Tipo del lote y caso de uso.** Depende de T4.
      Archivos: `lib/modules/inventario/domain/product-batch.ts`,
      `lib/modules/inventario/domain/create-product.ts`,
      `tests/unit/inventario/create-product.test.ts`.
      `NewProductBatch` gana `purchaseDate: string` (obligatorio, fecha civil) y el docblock de
      `lot` pasa a decir que `null` significa **«que lo genere el backend»**. El caso de uso resuelve
      «hoy» con el **mismo** `now()` que ya usa para `created_at` y rechaza la fecha futura con
      `ValidationError`. Orden fijo: permiso → zod → fecha → costo → nombre → escritura.
      **Ojo:** `create-product.test.ts:307, 314, 317` afirman hoy `lot === null` y hay que
      reescribirlos (`design.md > 0.2`, filas 5 y 9).
      **Hecho:** tests de (a) sin fecha ⇒ se pasa hoy al puerto, (b) fecha de mañana ⇒
      `ValidationError` y **cero** llamadas al repositorio, (c) fecha de la semana pasada ⇒ se
      acepta tal cual, (d) actor sin permiso ⇒ `UnauthorizedError` sin tocar el puerto ni calcular
      ninguna fecha. Cubre **R2, R3, R4, R5, R24** y el lado dominio de **R8**.

## Tanda 3 — persistencia y concurrencia (el corazón de la ficha)

- [x] **T6 — Generación del correlativo en el adaptador.** Depende de T2, T5 y **T0**.
      Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`.
      `resolveLot(tx, batch, scope)` con los tres pasos de `design.md > 3.2`: `pg_advisory_xact_lock`
      **como sentencia aparte y antes** del `SELECT` del máximo —el docblock **tiene que** explicar
      el porqué de `READ COMMITTED`, es lo que impide que alguien lo «simplifique» metiéndolo dentro
      del `INSERT`—, el máximo con `max(("lot")::numeric)::text` sobre `'^[0-9]+$'` —**sin cota de
      dígitos**, con la suma en `BigInt` sobre el texto— acotado a la empresa del ámbito, y el
      `INSERT` con la API tipada. `toBatchPurchaseDate` calcado de `toBatchExpiryDate`.
      `isDuplicateBatchLot`: `P2002` **y** que el **conjunto de columnas** de `meta.target` sea
      exactamente `{company_id, lot}` (no el nombre del índice: Prisma 6.19.3 entrega columnas, mismo
      criterio que `unit-write-prisma.ts`); cualquier otro `P2002` se relanza.
      *(Enmendado el 2026-09-15: m4 cambió `'^[0-9]{1,18}$'` + `::bigint` por `'^[0-9]+$'` +
      `::numeric`, y m1 cambió «nombre del índice» por «conjunto de columnas». Los dos cambios
      recogen lo que ya está implementado; la task sigue hecha.)*
      Reintento acotado (3) **fuera** de `prisma.$transaction`, solo para el lote **generado**.
      **Hecho:** typecheck y lint en verde; el archivo sigue siendo el único del módulo que importa
      `@prisma/client`; ningún `catch` vacío; el lote escrito a mano no pide lock ni calcula máximo.
      Cubre **R8, R9, R10, R13, R15, R25, R27** (verificados en T8).

- [x] **T7 [P] — Cableado y contrato del módulo.** Depende de T6.
      Archivos: `lib/composition/index.ts` (si cambia algo), `lib/modules/inventario/index.ts`.
      El puerto **no cambia de firma** (`design.md > 3.1`), así que esto debería ser casi vacío: la
      task existe para comprobarlo, no para hacer trabajo.
      **Hecho:** `tests/unit/inventario/module-contract.test.ts` y las guardias de arquitectura y de
      ámbito de empresa en verde; el contrato público **no** expone listar/editar/borrar lotes
      (**R32**).

- [x] **T8 — Integración contra base real, incluida la carrera.** Depende de T6 y T7.
      Archivos: `tests/integration/inventario/product-batch-lot.int.test.ts` (nuevo),
      `tests/integration/aislamiento.json` (entrada nueva en **`commit`** con motivo y `desde`).
      Casos exigidos, y ninguno se puede sustituir por un unitario:
      1. empresa sin lotes ⇒ el alta genera `'1'`; la siguiente, `'2'` (**R9**);
      2. existe `'50'` tecleado a mano ⇒ el siguiente generado es `'51'` (**R16**);
      3. lotes no numéricos (`'ACME-2026-07'`) no alteran la serie (**R9**);
      4. lote escrito a mano que ya existe en la empresa ⇒ rechazo distinguible, **cero** filas
         escritas (**R13**);
      5. dos empresas con el **mismo** valor de lote ⇒ las dos se escriben (**R12**);
      6. duplicado dentro de la empresa por SQL crudo ⇒ `23505` del índice (**R11**, la garantía en
         la base, no en el código);
      7. **la carrera**: dos altas de la misma empresa con `Promise.all`, sin `await` intermedio ⇒
         las dos resuelven, los lotes son **distintos y consecutivos** (**R14**);
      8. `purchase_date` guardada sin corrimiento de día, leída como texto (**R3**);
      9. `lot = ''` por SQL crudo ⇒ rechazado por `product_batches_lot_not_blank` (**R7**);
      10. el relleno de la migración reproducido sobre filas sembradas: por orden de creación, por
          empresa, continuando desde el máximo, y las filas con lote lo conservan (**R18, R19**), con
          el caso de **tabla vacía** (**R20**) y el de duplicado previo que aborta (**R21**).
      **Hecho:** `pnpm run test:integration` en verde con la base efímera de QC-77; ningún caso
      afirma sobre filas que no creó él mismo; limpieza en `finally` en orden de FK.
      Cubre **R3, R7, R9, R11, R12, R13, R14, R16, R18, R19, R20, R21, R25, R27, R33**.

- [x] **T9 — Error de lote duplicado.** Depende de **T0** y T6.
      Archivos: según la respuesta de T0 — si se aprueba:
      `lib/modules/errores/domain/error-codes.ts`, `lib/modules/errores/domain/error-catalog.ts`,
      `lib/modules/inventario/domain/errors.ts`, `tests/unit/errores/catalogo.test.ts`.
      La enmienda se **escribe** en la cabecera de `error-codes.ts` como hicieron la cuarta y la
      quinta, con fecha y con quién la aprobó. Si T0 sale «plan B», esta task es solo la nota en el
      `impl_` y el recorte de R13.
      **Hecho:** `tests/guards/guard-catalogo-de-errores.test.ts` en verde, ningún texto repetido
      entre dos claves, y la traducción del `P2002` llega al borde con su código. Cubre **R13**.

## Tanda 4 — borde y límites

- [x] **T10 [P] — Server Action.** Depende de T5.
      Archivos: `lib/modules/inventario/adapters/driving/product-actions.ts`,
      `tests/unit/inventario/product-actions.test.ts`.
      Una línea: `purchaseDate: readOptionalFormString(formData, 'purchaseDate')` en
      `buildCreateProductCandidate`. `buildUpdateProductCandidate` **no** se toca.
      **Hecho:** test de que el campo viaja tal cual cuando viene y llega `undefined` cuando no, y
      de que la edición sigue sin ningún campo de lote. Cubre el lado borde de **R2**.

- [x] **T11 [P] — Los límites de alcance, con test.** Depende de nada.
      Archivos: `tests/unit/inventario/qc81-alcance.test.ts` (nuevo; patrón de
      `tests/unit/identity/qc78-alcance.test.ts`).
      Afirma contra el **diff de la rama** frente al merge-base con `origin/dev`: cero archivos bajo
      `app/**` y `components/**` (**R28**), cero archivos bajo `e2e/**` (**R29**), `package.json` y
      `pnpm-lock.yaml` intactos (**R30**). Y por lectura de código: `products.stock` se sigue
      escribiendo como lo dejó QC-90 y no existe ninguna operación de ajuste ni de suma de lotes
      (**R31**), y el contrato público no expone listar/editar/borrar lotes (**R32**).
      **Hecho:** el test en verde y **rojo si alguien toca la pantalla**. Cubre **R28, R29, R30,
      R31, R32**.

## Tanda 6 — enmienda del 2026-09-15: el lote numérico cabe siempre (D13)

> **Enmienda aprobada por el humano el 2026-09-15** (F1.4). T13 y T14 están en marcha. **T15 no
> aplica**: P1 se cerró con la opción D ese mismo día.
>
> Los archivos de esta tanda **siguen sin tocar** `app/**`, `components/**` ni `e2e/**` (R28,
> R29), y **no** añaden ningún export al contrato público de `inventario`. Si alguna task acaba
> pidiendo un export nuevo, hay que tocar `tests/unit/inventario/module-contract.test.ts:133` y
> `tests/unit/inventario/qc81-alcance.test.ts:611`, y eso se anota como desviación.

- [x] **T13 [P] — La regla en el esquema de entrada del lote.** Depende de la aprobación de la
      enmienda.
      Archivos: `lib/modules/inventario/domain/product-batch-input.ts`,
      `tests/unit/inventario/product-batch-input.test.ts`,
      `tests/unit/inventario/create-product.test.ts`, y el docblock de `resolveLot` en
      `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts` (**solo el
      comentario**).
      Qué se hace en `lotSchema`, según `design.md > 4.6`:
      - `.max(PRODUCT_BATCH_LOT_MAX_LENGTH, { abort: true })`;
      - un `refine` que rechaza el valor ya recortado cuando casa con `/^[0-9]+$/` y su largo es
        `>= PRODUCT_BATCH_LOT_MAX_LENGTH`, con el mensaje propuesto en §4.6.
      
      El patrón es una constante **no exportada**, y su docblock dice que es el mismo conjunto
      que `'^[0-9]+$'` de `resolveLot` y del relleno. ~~El docblock de `lotSchema` cita D13 y R34.
      En `resolveLot`, el «LÍMITE CONOCIDO» pasa a decir que desde R34 solo lo alcanzan datos ya
      escritos o escritos por otra vía, y remite a P1.~~
      *(Corregido el 2026-09-15: esa orden de citar fichas y requisitos en comentarios contradecía
      `docs/conventions.md > Comentarios (2026-09-15)`, y el implementer ya la sustituyó por el porqué
      solo. Los comentarios explican el porqué sin citas.)*
      **Hecho:**
      - `product-batch-input.test.ts`, con un caso por fila:
        - 60 dígitos ⇒ **un solo** issue, con ruta `lot` y código `custom` (R34);
        - 60 dígitos con ceros a la izquierda ⇒ se rechaza igual (R34);
        - 60 dígitos rodeados de espacios ⇒ se rechaza, porque cuenta el valor recortado (R34);
        - 61 dígitos ⇒ **un solo** issue, el del largo, y no dos (R34);
        - 59 dígitos ⇒ se acepta (R35);
        - 60 caracteres con una letra o un guion ⇒ se acepta (R35);
        - el lote ausente sigue siendo válido (R8, sin regresión).
      - `create-product.test.ts`: con un lote de 60 dígitos, el caso de uso lanza
        `ValidationError` (`invalid_input`) y el repositorio recibe **cero** llamadas, así que ni
        se escribe ni se genera correlativo (R34).
      - `pnpm typecheck`, `pnpm lint` y `vitest related` sobre los archivos tocados, en verde.
      
      Cubre **R34, R35**.

- [x] **T14 — La frontera contra base real.** Depende de T13.
      Archivos: `tests/integration/inventario/product-batch-lot.int.test.ts` (casos nuevos; el
      archivo ya está censado en `tests/integration/aislamiento.json`, así que no hace falta
      entrada nueva).
      Por el **caso de uso con el repositorio real**, como el caso «R3, R2: por el caso de uso»
      que ya existe, y con una empresa propia:
      1. se teclea un lote de **59 nueves** y se escribe (R35);
      2. la alta siguiente, sin lote, genera `'1' + 59 ceros`, **de 60 caracteres**, y se escribe
         sin `23514`, con una sola `$transaction` y sin reintento (R36);
      3. la alta siguiente genera `'1' + 58 ceros + '1'`, también de 60 caracteres (R36);
      4. un lote tecleado de 60 dígitos ⇒ `ValidationError` y **cero** filas nuevas en la empresa
         (R34).
      **Hecho:** `pnpm exec vitest run --project integration` sobre ese archivo, en verde contra la
      base efímera de QC-77. Ningún caso afirma sobre filas que no creó él mismo, y la limpieza va
      en `finally` en orden de FK. Cubre **R34, R35, R36**.

- ~~**T15 — La migración ante un lote numérico de 60 caracteres ya escrito.**~~ **NO APLICA —
      cancelada el 2026-09-15.**
      **Motivo:** P1 se cerró con la **opción D**. Respuesta textual del humano: «no los hay, es
      nuevo todo»; no hay datos previos con lotes de solo dígitos de 60 caracteres o más.
      **Consecuencia:**
      - la migración **no** lleva guardia y **no** cambia;
      - **no nace ningún requisito** (el número R37 lo tomó después D14, con T16);
      - el caso vecino, los lotes de más de 60 caracteres, tampoco se protege
        (`requirements.md > Preguntas abiertas > P1`, `design.md > 9.6`).
      
      Nadie la implementa. Lo que sigue es el texto original, que se conserva como constancia:
      ~~**Bloqueada por P1** (`requirements.md > Preguntas abiertas`).~~
      Archivos, según la respuesta:
      `db/migrations/20260913120000_product_batch_lot_and_purchase_date/migration.sql`,
      `tests/unit/inventario/schema/product-batch-lot-migration.test.ts`,
      `tests/integration/inventario/product-batch-lot.int.test.ts` (escenario del caso 10, con el
      SQL real de disco).
      - **Respuesta A o B** (una guardia que aborta con mensaje propio): la guardia va en el paso
        1, junto a la de duplicados, con la condición exacta de la opción elegida (`design.md >
        9.6`). Se escribe con el mismo formato de `RAISE EXCEPTION` que R21: cuántas empresas o
        filas son, la consulta para localizarlas y qué hacer. Se añade el requisito que corresponda
        (el que entonces habría sido R37; hoy ese número es de D14) con su test de integración (aborta entero y no deja nada a medias) y su test
        estático (la guardia va antes de todo cambio).
      - **Respuesta D** (se acepta como límite): no cambia ninguna sentencia. Solo cambia el
        comentario del paso 4 de `migration.sql`, que cita D13 y R34 y dice que el límite ya solo
        lo alcanzan datos previos. `design.md > 9.6` se deja como límite aceptado, con la fecha de
        la respuesta.
      - **En los dos casos**: la migración todavía no ha llegado a `dev`, así que cambiarla está
        permitido (precedente de m4). La huella de migraciones cambia y la plantilla de QC-77 se
        reconstruye sola. **No** se migra la base de desarrollo compartida.
      **Hecho:** la respuesta a P1 está escrita en `progress/impl_QC-81-lote-y-fecha-de-compra.md`.
      Los tests de la opción elegida están en verde. Si la respuesta es A o B, el test de la
      guardia **se pone rojo** al quitar la guardia (mutación con copia y restauración, como en m4).
      ~~Cubría el requisito que naciera de P1.~~ *No nació ninguno: T15 no aplica (2026-09-15).*

## Tanda 7 — segunda enmienda del 2026-09-15: el alta sobre un producto que se borra a la vez (D14)

> **No se empieza sin la aprobación humana de esta segunda enmienda** (F1.4).
>
> Los comentarios de los archivos que se toquen siguen `docs/conventions.md > Comentarios
> (2026-09-15)`: explican el porqué y **no citan** fichas, requisitos ni `design.md`. `R37` va
> **solo** en el nombre de los tests.

- [x] **T16 — Bloquear la fila del producto en el alta sobre un producto existente.** Depende de la
      aprobación. Comparte `product-batch-lot.int.test.ts` con T14: no se editan a la vez.
      Archivos:
      - `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`, solo `addBatchToAlive`;
      - `tests/unit/inventario/product-batch-lot-retry.test.ts`;
      - `tests/integration/inventario/product-batch-lot.int.test.ts`, con dos casos nuevos. El archivo
        ya está censado en `tests/integration/aislamiento.json` como `commit`.
      
      Qué se hace (`design.md > 10.2` y `> 10.3`):
      - el `findFirst` que comprueba que el producto está vivo pasa a ser el `SELECT "id" … FOR NO KEY
        UPDATE` con `tx.$queryRaw`, con la empresa de `companyScopeColumns(scope)`, y es la **primera**
        sentencia de la transacción;
      - el orden queda fijo: fila → `resolveBatchLot()` → `INSERT`. Sin fila, devuelve `null` sin pedir el
        lock de aviso y sin escribir, como hoy;
      - `createWithFirstBatch` **no** se toca (§10.4).
      
      **Hecho:**
      - **Unitario** (`product-batch-lot-retry.test.ts`, con los dobles de Prisma):
        - los casos de `addBatchToAlive` que hoy doblan `product.findFirst` pasan a doblar la lectura
          por `$queryRaw`, sin cambiar lo que afirman;
        - caso nuevo «R37: addBatchToAlive bloquea la fila del producto con FOR NO KEY UPDATE antes de
          pedir el lock del correlativo»: la primera llamada de la transacción es un `$queryRaw` cuyo
          SQL contiene `FOR NO KEY UPDATE` y `deleted_at`, y va **antes** que el `$executeRaw` del lock
          de aviso;
        - sin fila ⇒ `null`, con cero `$executeRaw` y cero `productBatch.create`.
      - **Integración contra base real**, con dos casos. Cómo se montan los dos:
        - son **deterministas, sin `sleep`**: se espera mirando `pg_stat_activity` de la base de la
          corrida, con una cota de unos 3 s, por debajo del límite de la transacción interactiva;
        - usan un `Client` de `pg` aparte para sujetar los locks;
        - necesitan un pool de Prisma de más de una conexión, igual que el de R14.
        
        Los casos:
        1. «R37: con el borrado confirmado antes, el alta espera la fila, devuelve null y no escribe
           ningún lote»:
           - el `Client` abre transacción y ejecuta el `UPDATE` del borrado lógico **sin confirmarlo**;
           - se lanza `addBatchToAlive` con un lote tecleado único, sin `await`;
           - se espera a ver un backend con `wait_event_type = 'Lock'` y `wait_event` igual a
             `transactionid` o `tuple`. Si el alta termina antes, **falla** con el mensaje de que el
             alta no esperó a la fila;
           - `COMMIT` del `Client`;
           - el alta resuelve `null` y el producto tiene **cero** lotes nuevos.
        2. «R37: con el alta llegando antes, el borrado espera a que el alta confirme y el lote queda
           escrito antes del borrado»:
           - el `Client` abre transacción y toma el **mismo** lock de aviso del correlativo de esa
             empresa, con las mismas claves que el adaptador, para pausar un alta con lote generado;
           - se lanza `addBatchToAlive` sin `await` y se espera a ver un backend con
             `wait_event = 'advisory'`;
           - se lanza `softDeleteAliveProduct` sin `await` y se espera a verlo esperando un lock de fila.
             Si el borrado resuelve antes, **falla** diciendo que el borrado no esperó al alta;
           - `COMMIT` del `Client`;
           - el alta resuelve con su `batchId` **antes** que el borrado (el orden se registra al
             asentarse cada promesa), el borrado devuelve `true` y el lote existe.
        
        En los dos: empresa y producto propios, `Promise.allSettled` antes de afirmar y de limpiar,
        limpieza en `finally` en orden de FK, y el `Client` se libera pase lo que pase.
      - **Muerde, y se mide, no se razona.** Con copia y restauración, como en m4, se quita `FOR NO KEY
        UPDATE` de la consulta: **los dos casos se ponen rojos**, cada uno con su propio mensaje. Al
        restaurar, `git diff lib/` sale vacío y los dos vuelven a verde. La salida literal va en la
        bitácora.
      - `pnpm typecheck`, `pnpm lint`, `vitest related` sobre los archivos tocados,
        `tests/guards/guard-ambito-empresa-inventario.test.ts` y
        `tests/unit/inventario/company-scope.test.ts`, todo en verde.
      - Ningún comentario nuevo cita fichas, requisitos ni el spec.
      
      Cubre **R37**.

## Tanda 5 — cierre

- [ ] **T12 — Trazabilidad y gate.** Depende de todas, **incluidas T13 y T14** de la enmienda y **T16**
      de la segunda enmienda. T15 no aplica.
      Archivos: `progress/impl_QC-81-lote-y-fecha-de-compra.md`.
      El mapa `R1..R37 -> test` completo, sin ningún requisito huérfano. R37 es el de D14, con sus dos
      casos de integración y la salida literal de la mutación sin el lock de fila. R4 va citado
      con su redacción precisada (m3). Se escribe el cierre de P1 (opción D, 2026-09-15). Y se pega la salida real de
      `./init.sh` **completo** pegada; la nota del E2E diferido a QC-103 con su motivo (excepción
      consciente a `CHECKPOINTS.md`); y la respuesta de T0 escrita.
      **Hecho:** gate completo en verde, ningún archivo rojo fuera de `tests/baseline-rojos.json`.

## Mapa requisito → task (para que ninguno se quede sin dueño)

| R | Task que lo cubre |
|---|---|
| R1 | T1 (columna NOT NULL), T2, T8 |
| R2 | T4, T5, T10 |
| R3 | T5, T6, T8 |
| R4, R5 | T5 |
| R6 | T4 |
| R7 | T1, T2, T8 (caso 9) |
| R8 | T5, T6, T8 (caso 1) |
| R9 | T6, T8 (casos 1 y 3) |
| R10 | T6, T8 (caso 4) |
| R11 | T1, T2, T8 (caso 6) |
| R12 | T1, T8 (caso 5) |
| R13 | T6, T9, T8 (caso 4) |
| R14 | T6, T8 (caso 7) |
| R15 | T6 (unitario del reintento) y T8 (caso 7) |
| R16 | T8 (caso 2) |
| R17 | T1, T3 |
| R18, R19 | T1, T8 (caso 10) |
| R20 | T1, T8 (caso 10) |
| R21 | T1, T3, T8 (caso 10) |
| R22, R23 | T1, T3 |
| R24 | T5 |
| R25 | T6, T8 |
| R26 | T2, T3 |
| R27 | T6, T8 |
| R28, R29, R30, R31, R32 | T11 |
| R33 | T8 |
| R34 | T13 (esquema de entrada y caso de uso), T14 (caso 4) |
| R35 | T13 (59 dígitos y 60 caracteres con letra), T14 (caso 1) |
| R36 | T14 (casos 2 y 3) |
| R37 | T16 (unitario del orden de locks; integración casos 1 y 2, que se ponen rojos sin el lock de fila) |

*Enmienda del 2026-09-15:*
- **R4** cambia de redacción (m3) pero **no** de task: lo sigue cubriendo T5, con el test que ya
  afirma `invalid_input` y el `diagnostic` con `purchaseDate`.
- **R6** se precisa por el mismo motivo y lo sigue cubriendo T4.
- **P1 no tiene requisito.** Se cerró con la opción D, así que T15 no aplica y no figura en este mapa.
- **R37 es de D14** (segunda enmienda del 2026-09-15), no de P1: el número quedó libre y lo tomó
  D14. Lo cubre T16.
