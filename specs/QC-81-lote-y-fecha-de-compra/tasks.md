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

- [ ] **T2 — El esquema Prisma al día.** Depende de T1.
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

- [ ] **T6 — Generación del correlativo en el adaptador.** Depende de T2, T5 y **T0**.
      Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`.
      `resolveLot(tx, batch, scope)` con los tres pasos de `design.md > 3.2`: `pg_advisory_xact_lock`
      **como sentencia aparte y antes** del `SELECT` del máximo —el docblock **tiene que** explicar
      el porqué de `READ COMMITTED`, es lo que impide que alguien lo «simplifique» metiéndolo dentro
      del `INSERT`—, el máximo sobre `'^[0-9]{1,18}$'` acotado a la empresa del ámbito, y el
      `INSERT` con la API tipada. `toBatchPurchaseDate` calcado de `toBatchExpiryDate`.
      `isDuplicateBatchLot`: `P2002` **y** el nombre del índice; cualquier otro `P2002` se relanza.
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

- [ ] **T8 — Integración contra base real, incluida la carrera.** Depende de T6 y T7.
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

## Tanda 5 — cierre

- [ ] **T12 — Trazabilidad y gate.** Depende de todas.
      Archivos: `progress/impl_QC-81-lote-y-fecha-de-compra.md`.
      El mapa `R1..R33 -> test` completo, sin ningún requisito huérfano; la salida real de
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
