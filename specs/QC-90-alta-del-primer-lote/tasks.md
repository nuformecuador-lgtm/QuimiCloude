# QC-90 — alta-del-primer-lote · tasks.md

> `[P]` = paralelizable con las otras `[P]` de su misma tanda. Cada task declara **los archivos
> que toca** y su criterio de «hecho». Ninguna task se da por hecha sin `./init.sh --rapido` en
> verde; la feature no se cierra sin `./init.sh` completo (`docs/verification.md`).
>
> **No hay migración en esta ficha** (R29) y **no entra ninguna dependencia** (`design.md > 5`):
> si alguna task acaba pidiendo una, se para y se sube la propuesta, no se instala.

## Tanda 1 — dominio puro (sin puerto, sin Prisma)

- [ ] **T1 [P] — Derivación del costo unitario.**
      Archivos: `lib/modules/inventario/domain/unit-cost.ts` (nuevo),
      `tests/unit/inventario/unit-cost.test.ts` (nuevo).
      `deriveUnitCost(totalCost, stock)` con `BigInt`, redondeo mitad arriba a 4 decimales,
      `null` cuando redondea a `0.0000`.
      **Hecho:** tests en verde para `'12.5'/5 → '2.5000'`, `'10'/3 → '3.3333'`, `'0.0001'/5 →
      null`, y una comprobación de que ningún importe pasa por `Number`/`parseFloat` en el
      archivo. Cubre **R7, R9**.

- [ ] **T2 [P] — Tipo del lote.**
      Archivos: `lib/modules/inventario/domain/product-batch.ts` (nuevo).
      `NewProductBatch` con `presentationId`, `stock`, `unitCost` (cadena), `lot`, `expiryDate`
      (`YYYY-MM-DD`) y `createdBy`.
      **Hecho:** `pnpm run typecheck` en verde y el tipo no menciona `Prisma` ni `Date`.

- [ ] **T3 — Esquema de entrada compartido.** Depende de T1.
      Archivos: `lib/modules/inventario/domain/product-batch-input.ts` (nuevo),
      `lib/modules/inventario/index.ts`,
      `tests/unit/inventario/product-batch-input.test.ts` (nuevo).
      `createProductWithFirstBatchSchema` según `design.md > 4`, con los tres `superRefine` y su
      `path`. `createProductSchema` **no se toca**.
      **Hecho:** tests que comprueban forma decimal, rechazo del cero, rechazo del campo
      desconocido, y que el issue de «solo total con existencia 0» cuelga de `['stock']` y el de
      «ningún costo» de los dos campos de costo. Cubre **R2, R4, R5, R8, R10, R11, R12, R14, R24**.

## Tanda 2 — puerto y caso de uso

- [ ] **T4 — Puerto.** Depende de T2.
      Archivos: `lib/modules/inventario/ports/product-repository.ts`.
      Añade `findAliveIdByName`, `createWithFirstBatch` y `addBatchToAlive`; los cinco métodos de
      hoy no cambian de firma.
      **Hecho:** typecheck en verde; el puerto no importa `@prisma/client`.

- [ ] **T5 — Caso de uso del alta.** Depende de T3 y T4.
      Archivos: `lib/modules/inventario/domain/create-product.ts`,
      `tests/unit/inventario/create-product.test.ts`.
      Orden fijo: permiso → zod → derivación → resolución por nombre → escritura. Producto vivo
      encontrado ⇒ solo `addBatchToAlive`; ninguno ⇒ `createWithFirstBatch` con la existencia en
      las dos filas. `createdBy = actor.id`.
      **Hecho:** tests con repositorio doble que verifican, entre otros, que un actor sin
      `inventario.modificar` lanza `UnauthorizedError` **sin una sola llamada al repositorio**, que
      con producto existente `createWithFirstBatch` no se llama nunca y el candidato de producto no
      viaja, que un nombre que solo coincide con productos borrados crea uno nuevo, y que con
      existencia 0 el lote se crea igual. Cubre **R1, R3, R6, R7, R9, R10, R15, R16, R17, R18,
      R19, R20, R22, R23**.

## Tanda 3 — persistencia

- [ ] **T6 — Adaptador Prisma.** Depende de T4.
      Archivos: `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`.
      Las tres funciones nuevas: normalización con `normalizeProductName` + `deletedAt: null` +
      desempate estable; `prisma.$transaction` para producto+lote; `Prisma.Decimal` y
      `new Date(...T00:00:00Z)` solo aquí; traducción del fallo de FK de `presentation_id` a
      `ValidationError`.
      **Hecho:** typecheck y lint en verde; el archivo sigue siendo el único del módulo que
      importa `@prisma/client` y sigue sin tocar `users`.

- [ ] **T7 — Cableado.** Depende de T6.
      Archivos: `lib/composition/index.ts`.
      **Hecho:** `productRepository` cumple el puerto completo; `tests/unit/composition/*` y las
      guardias de arquitectura en verde.

- [ ] **T8 — Tests de integración contra Postgres.** Depende de T6 y T7.
      Archivos: `tests/integration/inventario/product-batch-write.int.test.ts` (nuevo).
      Cada caso dentro de `prisma.$transaction` con `ROLLBACK`, como el resto de `tests/integration/`.
      **Hecho:** verifican el costo derivado guardado con sus 4 decimales, la fecha de expiración
      sin corrimiento de día, `lot`/`expiry_date` en `NULL` cuando no vienen, `created_by` =
      actor, el rechazo del `CHECK (unit_cost > 0)`, que un fallo del lote **no deja producto**
      (R21) y que agregar lote a un producto existente deja `stock`/`qty_alert`/`name` intactos.
      Cubre **R13, R18, R21, R22** y el lado base de **R5, R7, R12**.

## Tanda 4 — borde y pantalla

- [ ] **T9 — Server Action.** Depende de T5 y T7.
      Archivos: `lib/modules/inventario/adapters/driving/product-actions.ts`,
      `tests/unit/inventario/product-actions.test.ts`.
      `buildProductCandidate` lee los cinco campos del lote **como cadenas**; ningún importe pasa
      por `Number`. `CreateProductFormState` no cambia de forma.
      **Hecho:** test de que los cinco campos del `FormData` llegan al caso de uso tal cual y de
      que la action no repite ni el permiso ni ninguna regla. Cubre **R25** por el lado servidor.

- [ ] **T10 — Formulario.** Depende de T3 y T9.
      Archivos: `app/(private)/inventario/components/product-form.tsx`,
      `tests/unit/inventario/product-page.test.tsx`.
      Cambia a `createProductWithFirstBatchSchema` en el alta, borra la validación manual del
      lote, alinea el copy de los dos costos a «mayor que 0».
      **Hecho:** los 30 tests de hoy siguen en verde, más los nuevos: costo `0` rechazado en su
      campo, «solo total con existencia 0» pintado en **existencia**, los cinco campos presentes en
      el `FormData` enviado, la edición sin ningún campo de lote, y lo escrito conservado tras un
      rechazo del servidor. Cubre **R25, R26, R27, R28**.

- [ ] **T11 [P] — Límites de alcance, con test.** Depende de T3.
      Archivos: `tests/unit/inventario/module-contract.test.ts` (o el equivalente ya existente),
      `app/(private)/inventario/components/product-name-picker.tsx` (solo comentario, si hace falta).
      **Hecho:** un test comprueba que el contrato público **no** expone listar/editar/borrar lotes
      (**R30**) y otro que `ProductView` sigue sin presentación y que la opción del autocomplete
      llega sin `presentationId` (**R31**).

- [ ] **T12 [P] — Que no hay migración.**
      Archivos: `tests/unit/inventario/schema/inventario-schema.test.ts`.
      **Hecho:** un test afirma que `db/migrations/` no gana ninguna carpeta en esta rama y que el
      modelo `ProductBatch` conserva sus columnas, sus `CHECK` y su RLS `ENABLE`+`FORCE` sin
      policies. Cubre **R29**.

## Tanda 5 — camino completo y cierre

- [ ] **T13 — E2E.** Depende de T10.
      Archivos: `e2e/inventario.spec.ts`.
      Un usuario con `inventario.modificar` da de alta un producto con presentación y **solo costo
      total**, y se comprueba que el lote quedó con el costo unitario **derivado**. Segundo caso:
      elegir un producto existente no crea otro producto.
      **Hecho:** el spec pasa en Playwright. Cubre **R32**, y es el E2E que exige la decisión
      cerrada del 2026-09-10 y `CHECKPOINTS.md`.

- [ ] **T14 — Trazabilidad y gate.** Depende de todas.
      Archivos: `progress/impl_QC-90-alta-del-primer-lote.md`.
      **Hecho:** el mapa `R1..R32 -> test` completo, sin ningún requisito huérfano; salida real de
      `./init.sh` completo pegada y sin ningún archivo rojo fuera de `tests/baseline-rojos.json`.

## Mapa requisito → task (para que ninguno se quede sin dueño)

| R | Task que lo cubre |
|---|---|
| R1, R3, R6, R15, R16, R17, R20, R22, R23 | T5 |
| R2, R4, R5, R10, R11, R12, R14, R24 | T3 |
| R7, R9 | T1, T5 |
| R8 | T3, T10 |
| R13, R21 | T8 |
| R18 | T5, T8 |
| R19 | T5 (nombre solo coincide con borrados ⇒ producto nuevo), T8 |
| R25, R26, R27, R28 | T9, T10 |
| R29 | T12 |
| R30, R31 | T11 |
| R32 | T13 |
