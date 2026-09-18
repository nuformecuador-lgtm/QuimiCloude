# QC-92 — ajuste-de-inventario · tasks.md

> **Complejidad `high`.** Las tandas están partidas para que **cada una deje el árbol
> compilando**. Hay **una** excepción y está dicha en la task, no disimulada: **T6 deja el
> `typecheck` en rojo** hasta que T7 la cierra, porque ampliar el puerto sin implementarlo no
> compila. No se corre el gate entre esas dos.
>
> **Los archivos de cada task están listados** para que el leader los cruce con las features en
> vuelo (`AGENTS.md > Paralelismo`).
>
> **`[P]`** = paralelizable con las demás `[P]` de su tanda.

---

## Tanda 0 — la puerta

- [x] **T0 — Aprobación de la séptima enmienda del catálogo de errores.**
      **No es una task de código: es una pregunta al humano**, y se responde en la puerta F1.4
      junto con el spec. `design.md > 7` propone `batch_not_found` y `batch_stock_negative`, con su
      plan B por si no se aprueban.
      **Hecho:** el humano dijo sí o no, y queda escrito en `progress/`. **Bloquea T5.**
      **Archivos:** ninguno.

---

## Tanda 1 — la base

- [x] **T1 — Modelo y migración de `inventory_movements`.**
      Modelo `InventoryMovement` en el esquema, con `/// @module inventario`, y migración escrita a
      mano con: tabla, las tres FK (`product_batches`, `companies`, `users`), los tres índices, los
      dos CHECK (`quantity <> 0`, `reason` coherente con `kind`), RLS `ENABLE` + `FORCE` sin
      policies, y el disparador `inventory_movements_check_company` calcado de
      `product_batches_check_company`. **Y su `down.sql`**, que revierte en orden inverso.
      **Hecho:** `pnpm run db:migrate` aplica y `pnpm run db:rollback` revierte dejando
      `_prisma_migrations` coherente; `pnpm run typecheck` verde. **Cubre R11, R15, R16, R17, R19,
      R31.**
      **Archivos:** `db/schema.prisma`,
      `db/migrations/<timestamp>_inventory_movements/migration.sql`,
      `db/migrations/<timestamp>_inventory_movements/down.sql`.

- [x] **T2 — Integración: las restricciones muerden de verdad.** Depende de T1.
      Un caso por restricción: `quantity = 0` rechazado; `kind='adjustment'` sin motivo rechazado;
      `kind='opening'` con motivo rechazado; asiento con empresa distinta de la del lote rechazado
      con el identificador `inventory_movements_company_differs_from_batch`; `stock` negativo por
      SQL crudo rechazado por `product_batches_stock_non_negative` (**que sigue ahí**).
      **Hecho:** los cinco casos pasan y el archivo tiene su fila en
      `tests/integration/aislamiento.json` con `motivo` y `desde`. **Cubre R3, R5, R10, R19.**
      **Archivos:** `tests/integration/inventario/inventory-movements-constraints.int.test.ts`,
      `tests/integration/aislamiento.json`.

---

## Tanda 2 — el dominio, en piezas puras

- [ ] **T3 [P] — Tipos y constantes del libro.** Depende de T1.
      `MOVEMENT_REASONS` + `MovementReason`; `LEDGER_START` con el timestamp de la migración de T1;
      `InventoryMovementView`, `NewInventoryMovement`, `ProductBatchView`.
      **Hecho:** `typecheck` y `lint` verdes; el test unitario afirma que añadir un motivo a la
      constante **no** exige tocar ninguna otra fuente. **Cubre R9.**
      **Archivos:** `lib/modules/inventario/domain/movement-reason.ts`,
      `lib/modules/inventario/domain/movement-ledger.ts`,
      `lib/modules/inventario/domain/inventory-movement.ts`,
      `lib/modules/inventario/domain/product-batch-view.ts`,
      `tests/unit/inventario/movement-reason.test.ts`.

- [ ] **T4 [P] — Los dos códigos de error nuevos.** Depende de **T0** (aprobados) y no de T3.
      Dos entradas en `ERROR_CODES` con su clave y su texto en `error-catalog.ts`, la **séptima
      enmienda escrita y fechada** en la cabecera de `error-codes.ts` —como la sexta— y las dos
      clases en `errors.ts` del módulo.
      **Si T0 sale que no**, esta task **no se hace** y el plan B de `design.md > 7` se aplica en T8.
      **Hecho:** `typecheck` verde (los `satisfies` obligan a las dos mitades) y el test del
      catálogo pasa. **Cubre R32.**
      **Archivos:** `lib/modules/errores/domain/error-codes.ts`,
      `lib/modules/errores/domain/error-catalog.ts`,
      `lib/modules/inventario/domain/errors.ts`.

---

## Tanda 3 — el repositorio (la única tanda que pasa por rojo)

- [ ] **T5 — Ampliar el puerto.** Depende de T3.
      `adjustBatchStock`, `findBatchesOfAliveProduct` y `findBatchMovements` en
      `ProductRepository`, con la nota de que la empresa no viaja en ningún tipo de entrada.
      **AVISO, dicho y no disimulado: esta task DEJA EL `typecheck` EN ROJO.** Declarar tres
      métodos en la interfaz sin implementarlos rompe el adaptador que la satisface. No hay forma
      de partirla que compile en medio, así que **T5 y T6 se cierran juntas** y el gate se corre
      **después de T6**, nunca entre las dos.
      **Hecho:** el puerto declara los tres y su docblock; se pasa a T6 sin correr el gate.
      **Archivos:** `lib/modules/inventario/ports/product-repository.ts`.

- [ ] **T6 — Implementar el libro y el ajuste en Prisma.** Depende de T5 (cierra su rojo).
      1. `batch-movement-prisma.ts`: `writeMovement(tx, …)` —recibe la `tx`, no la abre— y las dos
         lecturas del historial.
      2. `company-scope.ts`: **reintroducir** `batchCompanyScope` y añadir `movementCompanyScope`,
         las dos delegando en `companyScope`, con su consumidor en esta misma tanda (es la
         condición que el propio archivo dejó escrita en `:52-55`).
      3. `product-prisma.ts`: asiento de alta tras `tx.productBatch.create` en
         `createWithFirstBatch` (**`:503`**) y en `addBatchToAlive` (**`:542`**), dentro de la `tx`
         que ya abre `writeBatchWithLotRetry`.
      4. `product-prisma.ts`: `adjustBatchStock`, **la única** función que llama a
         `tx.productBatch.update(...)`, con `UPDATE … SET stock = stock + $delta` acotado por
         `company_id`, cero filas ⇒ `null`, y el asiento en la misma transacción. El `23514` de
         `product_batches_stock_non_negative` se traduce **por el nombre de la restricción**.
      **Hecho:** `typecheck` y `lint` verdes otra vez; tests unitarios del adaptador con Prisma
      mockeado: alta que asienta, ajuste que suma, ajuste que resta, lote de otra empresa ⇒ `null`,
      fallo del asiento ⇒ nada escrito. **Cubre R1, R2, R4, R6, R7, R12, R18.**
      **Archivos:** `lib/modules/inventario/adapters/driven/persistence/batch-movement-prisma.ts`,
      `lib/modules/inventario/adapters/driven/persistence/product-prisma.ts`,
      `lib/modules/inventario/adapters/driven/persistence/company-scope.ts`,
      `tests/unit/inventario/adjust-batch-stock-prisma.test.ts`,
      `tests/unit/inventario/batch-movement-prisma.test.ts`.

- [ ] **T7 — Ajustar la guardia R21 de QC-91, con nota fechada y prueba por mutación.**
      Depende de T6 y **va en su misma tanda**: en cuanto T6 entra, la guardia se pone roja, y
      dejarla así aunque sea un commit es exactamente el «tocarla en silencio» que D13 prohíbe.
      Conserva íntegras las ramas de `delete`, `deleteMany`, `upsert`, `DELETE` crudo y `UPDATE`
      crudo; la de `update` pasa a ser «fuera del cuerpo de `adjustBatchStock`», aislado con el
      `cuerpoDeFuncion` que ya existe en `:114-132`. **Nota fechada** encima del `describe` con qué
      ficha lo cambió y qué sigue prohibido; y autopruebas con fuentes fabricadas: `update` dentro
      de `adjustBatchStock` ⇒ verde; el **mismo** `update` en otra función ⇒ rojo; `delete`,
      `deleteMany` y el SQL crudo ⇒ rojo.
      **Hecho:** `./init.sh --rapido` verde por primera vez desde T5. **Cubre R26, R27.**
      **Archivos:** `tests/unit/inventario/qc91-alcance.test.ts`.

---

## Tanda 4 — casos de uso y cableado

- [ ] **T8 — Los tres casos de uso.** Depende de T6 y T4.
      `adjust-batch-stock.ts` con `requirePermission(actor, 'inventario.modificar')` **en la primera
      línea**, antes de zod y del puerto; `list-product-batches.ts` y `list-batch-movements.ts` con
      `inventario.consultar`. El ajuste **no** lee el stock para escribir el total: delega el
      `stock + delta` en el puerto. Motivo validado con `z.enum(MOVEMENT_REASONS)`; delta entero y
      distinto de cero.
      **Hecho:** tests del service con los tres casos de autorización —sin actor, con permisos
      vacíos, con solo `inventario.consultar`— rechazados **sin tocar el repositorio** (spy en cero),
      y el Operador nombrado en el caso. **Cubre R1, R2, R3, R8, R13, R20, R21.**
      **Archivos:** `lib/modules/inventario/domain/adjust-batch-stock.ts`,
      `lib/modules/inventario/domain/list-product-batches.ts`,
      `lib/modules/inventario/domain/list-batch-movements.ts`,
      `lib/modules/inventario/index.ts`,
      `tests/unit/inventario/adjust-batch-stock.test.ts`,
      `tests/unit/inventario/authorization.test.ts`.

- [ ] **T9 — Composición y Server Actions.** Depende de T8.
      Cableado en `lib/composition/index.ts` y `batch-actions.ts` (`'use server'`), con el **mismo**
      `runInRequestScope(() => Promise.all([...]))` de `product-actions.ts:68-80`.
      **Trampa conocida:** las tres acciones resuelven **usuario y empresa**, así que caen bajo el
      conteo de lecturas de sesión de QC-104 y hay que **anotarlas en la lista de esa guardia**; si
      no, el gate se pone rojo en un test que no habla de esta ficha.
      **Hecho:** `./init.sh --rapido` verde, incluida la guardia de QC-104. **Cubre R18, R20.**
      **Archivos:** `lib/modules/inventario/adapters/driving/batch-actions.ts`,
      `lib/composition/index.ts`, `tests/unit/inventario/batch-actions.test.ts`,
      el archivo de la lista de acciones de QC-104.

---

## Tanda 5 — la pantalla

- [ ] **T10 [P] — Panel de lotes del producto.** Depende de T9.
      Lista los lotes con número, **cantidad con su unidad** —derivada de la presentación, sin
      convertir— y fecha de compra. Datos **por props** desde el Server Component.
      **Hecho:** test de componente que pinta tres lotes y su unidad; y el de multiplataforma
      (targets ≥ 44x44, `font-size` ≥ 16 px, sin `:hover` como única vía). **Cubre R22, R25.**
      **Archivos:** `app/(private)/inventario/components/product-batches-panel.tsx`,
      `tests/unit/inventario/product-batches-panel.test.tsx`.

- [ ] **T11 [P] — Historial del lote.** Depende de T9.
      Despliegue con motivo, autor y fecha, del más reciente al más antiguo; y el **texto propio**
      del lote sin asientos, que explica que es anterior al libro y no parece una lista vacía.
      **Hecho:** dos tests —con asientos y sin ninguno— y la distinción frente al estado de error.
      **Cubre R23, R24.**
      **Archivos:** `app/(private)/inventario/components/batch-history.tsx`,
      `tests/unit/inventario/batch-history.test.tsx`.

- [ ] **T12 — Diálogo de ajuste.** Depende de T10.
      Cantidad **con signo** y motivo del conjunto cerrado, los dos obligatorios. El control **no
      existe en el DOM** sin `inventario.modificar` —ni visible, ni deshabilitado—.
      **Hecho:** test del envío, del rechazo de cantidad cero, y del Operador que ve el panel y no
      encuentra el control. **Cubre R2, R8, R21, R25.**
      **Archivos:** `app/(private)/inventario/components/adjust-batch-dialog.tsx`,
      `tests/unit/inventario/adjust-batch-dialog.test.tsx`.

- [ ] **T13 — Enganchar el panel al listado.** Depende de T10, T11, T12.
      Los tres componentes salen por el **barrel** de la ruta, y el listado abre el panel del
      producto. Nada se importa por ruta profunda.
      **Hecho:** `./init.sh --rapido` verde, incluido el test de contrato de la ruta. **Cubre R22.**
      **Archivos:** `app/(private)/inventario/components/index.ts`,
      `app/(private)/inventario/components/product-table.tsx`,
      `app/(private)/inventario/components/product-list-section.tsx`,
      `tests/unit/inventario/product-route-contract.test.ts`.

---

## Tanda 6 — que el libro y el `stock` no se separen

- [ ] **T14 — Guardia del censo de escrituras.** Depende de T6.
      `tests/guards/`, no `tests/unit/`: ningún grafo de imports la relacionaría con un cambio.
      Afirma **en positivo** que los caminos de escritura de `product_batches` bajo `lib/` son
      exactamente `{ createWithFirstBatch, addBatchToAlive, adjustBatchStock }` y que **cada uno**
      llama a `writeMovement(`. Con sus detectores probados sobre fuentes fabricadas.
      **Hecho:** roja ante un cuarto camino fabricado y ante un camino al que se le quita el
      asiento; verde sobre el árbol real. **Cubre R28.**
      **Archivos:** `tests/guards/guard-libro-de-inventario.test.ts`.

- [ ] **T15 — El cuadre, con su excepción escrita.** Depende de T6 y T3.
      Test de integración: para todo lote con `created_at >= LEDGER_START`, `stock` = suma de sus
      asientos. Los anteriores quedan **exceptuados de forma permanente**, y la excepción va escrita
      **en el propio test** —con su razón y con la frase de que a esos los cubre T14, no este
      test—, no en un JSON de configuración.
      **Hecho:** el test pasa con lotes creados por el alta y por el ajuste, y **falla** si se altera
      un `stock` por SQL crudo sin asiento. Fila en `aislamiento.json`. **Cubre R29, R30.**
      **Archivos:** `tests/integration/inventario/ledger-cuadre.int.test.ts`,
      `tests/integration/aislamiento.json`.

---

## Tanda 7 — cierre

- [ ] **T16 — E2E del ajuste.** Depende de T13.
      Recorrido: entrar al inventario, abrir el panel de lotes de un producto, ajustar con motivo,
      ver la existencia nueva y el asiento en el historial; y el Operador que no encuentra el
      control.
      **AVISO: `./init.sh` NO corre Playwright** (deuda conocida, `docs/verification.md`). Este E2E
      **se corre A MANO** (`pnpm exec playwright test e2e/ajuste-de-inventario.spec.ts`) y su
      resultado se pega en `progress/impl_QC-92-ajuste-de-inventario.md`. **El gate en verde no lo
      acredita.** **Cubre R34.**
      **Archivos:** `e2e/ajuste-de-inventario.spec.ts`.

- [ ] **T17 — Trazabilidad y gate completo.** Depende de **todas**.
      Mapa `R1..R34 -> test` en `progress/impl_QC-92-ajuste-de-inventario.md`; comprobar que
      `package.json` **no cambió** (R33); `./init.sh` completo verde y el E2E de T16 corrido a mano
      y anotado.
      **Hecho:** `CHECKPOINTS.md` recorrido entero, todas las tasks `[x]`, y las dos afirmaciones
      del gate (completo + E2E manual) escritas con su resultado. **Cubre R33 y cierra la
      trazabilidad de las 34.**
      **Archivos:** `progress/impl_QC-92-ajuste-de-inventario.md`, `specs/QC-92-ajuste-de-inventario/tasks.md`.

---

## Notas de dependencia, en una vista

```
T0 ─────────────► T4 ─┐
T1 ─► T2              │
 └──► T3 ─────────────┼─► T8 ─► T9 ─┬─► T10 [P] ─► T12 ─► T13 ─► T16 ─► T17
      T3 ─► T5 ─► T6 ─┘             └─► T11 [P] ─────────┘
                  └─► T7
                  └─► T14
                  └─► T15  (también depende de T3)
```

- **T5 → T6 → T7 es un bloque**: no se corre el gate dentro de él.
- **T10 y T11 son `[P]`** entre sí; tocan archivos distintos.
- **T4 muere si T0 sale que no**, y el plan B de `design.md > 7` se aplica dentro de T8.
