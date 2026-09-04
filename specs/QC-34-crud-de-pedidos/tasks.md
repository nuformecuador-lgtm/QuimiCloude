# QC-34 — crud-de-pedidos · tasks.md

> Zona: `backend` · Complejidad: `high` · Rama: `feature/QC-34-crud-de-pedidos`
>
> El **qué** está en `requirements.md` (R1–R58); el **cómo**, en `design.md`. Aquí está el desglose
> ejecutable. `[P]` marca lo que puede ir en paralelo con otra task del mismo grupo. Cada task tiene
> su criterio de «hecho»: si no se puede comprobar, no está hecha.
>
> **Antes de empezar:** el spec tiene que estar **aprobado** por el humano (F1.4). Ninguna task está
> bloqueada por una pregunta abierta —las tres que abre `spec_author` (el total en la salida, la
> importación de pedidos y el reemplazo completo) tienen posición por defecto **escrita** y ya está
> reflejada en los requisitos—, pero **si el humano cierra la 3 pidiendo el total en la salida**, T6 y
> T8 crecen y hay que abrir la propuesta de dependencia (`design.md > 13`) **antes** de escribir la
> multiplicación.
>
> Cierra cada tanda con `./init.sh --rapido`. **Antes del PR, `./init.sh` completo, sin excepción**
> (`docs/verification.md`): esta ficha acopla SQL, tipos enumerados y forma del árbol de módulos, y el
> grafo de imports no lo ve.

---

## T0 — Qué se hereda montado y NO se re-crea

**No se escribe nada: se comprueba y se anota en `progress/impl_QC-34-crud-de-pedidos.md`.** Existe
porque buena parte de esta feature es *no* volver a hacer lo que QC-33, QC-20, QC-25 y QC-43 dejaron
hecho.

Se hereda y **no se toca**:

- **El modelo entero.** `Order`, `OrderStatus`, `OrderPriority` en `db/schema.prisma` y la migración
  `db/migrations/20260903191204_orders/`. **Ninguna tabla nueva, ninguna columna fuera de
  `cancellation_reason`, ningún índice nuevo, ninguna FK nueva** (R48).
- **Los cinco `CHECK` de QC-33.** Solo se toca `orders_delivered_not_deleted`; los otros cuatro
  —cantidad, precio, posición positiva y **año contra `created_at` en UTC**— siguen intactos y esta
  ficha tiene que **satisfacerlos**, no cambiarlos.
- **`lib/modules/pedidos/domain/order-number.ts`** (`formatOrderNumber`, siete dígitos),
  **`order-classification.ts`** (los valores y sus defectos) y **`order-contents.ts`**. Se consumen;
  `order-classification.ts` solo cambia si el valor `CANCELADO` tiene que aparecer allí (T3).
- **`lib/shared/pagination.ts`** (`DEFAULT_PAGE_SIZE = 10`, `MAX_PAGE_SIZE = 25`) y su test. Se
  **consume**, no se toca ni se reimplementa (R37).
- **`UnitCatalog.findRefs`** de `@/lib/modules/unidades`, ya implementado y ya cableado en
  `lib/composition` como `unitCatalog`. **No se amplía `unidades` y no se crea una segunda
  instancia** (`design.md > 6.3`).
- **`ROLE_ADMINISTRADOR`**, exportado por el barrel `@/lib/modules/identity`. **No se declara ninguna
  constante de rol en `pedidos`** (R4), y **no se tocan** las copias locales de `inventario`,
  `recetas` y `unidades`: eso es la ficha de arnés que ya está en el board.
- **La sesión real** (QC-8): `identity.getSessionUser()` cableado en `lib/composition`.
- **Las tres guardias** y `tests/unit/pedidos/module-contract.test.ts`. Se ejecutan y se amplían donde
  toque; **ninguna se relaja para que algo pase**.

Se hereda **vacío y esta ficha lo llena**: `ports/.gitkeep`, `adapters/driven/.gitkeep`,
`adapters/driving/.gitkeep`. Los tres se **borran** al aparecer el primer archivo real de su carpeta
(R52).

**Hecho cuando:** la lista está pegada en `progress/impl_QC-34-crud-de-pedidos.md` y cada punto
verificado contra el árbol de la rama, no contra este documento.

---

## Grupo A — cimientos (nada depende de la base todavía)

- [x] **T1 [P] — Dominio base del módulo.** `domain/actor.ts` (`Actor`, `requireAdmin`, con
      `ROLE_ADMINISTRADOR` importado del **barrel** `@/lib/modules/identity`), `domain/errors.ts`
      (`PedidosError` y las nueve clases con su `code` de `design.md > 7.5`), `domain/page.ts`
      (`Page<T>`, `PageQuery`, `pageQuerySchema`, copia de `recetas`).
      *Depende de:* T0. **Hecho cuando:** `pnpm run typecheck` limpio; `domain/` no importa
      framework, Prisma, `lib/shared/` ni `composition`; `guard-arquitectura-modulos` verde con el
      import del barrel de `identity`.

- [x] **T2 [P] — Test de alcance, adelantado.** `tests/unit/pedidos/scope.test.ts`: ninguna ruta,
      página ni componente de pedidos bajo `app/`, ningún route handler, ningún spec E2E nuevo,
      ninguna reimplementación de la aritmética de paginación, ningún `.gitkeep` en carpeta con
      archivos, el contrato sin `'use server'`, y `pedidos` sin `prisma.recipe`/`prisma.unit`/
      `prisma.user` ni imports profundos de otro módulo.
      *Depende de:* T0. **Hecho cuando:** el test pasa **y** falla si se le añade una entrada
      sintética que viole cada regla (R37, R52, R53, R57, R58).

- [x] **T3 — El valor `CANCELADO` en el esquema y en el dominio.** `enum OrderStatus` gana
      `CANCELADO` en `db/schema.prisma`; `Order` gana `cancellationReason String? @map(...)`;
      `domain/order-classification.ts` añade el valor a `ORDER_STATUS_VALUES` **en el mismo orden**.
      *Depende de:* T1. **Hecho cuando:** `pnpm prisma validate` pasa, `pnpm run typecheck` limpio, y
      el test de contrato de QC-33 —que compara el esquema con las listas del dominio, valor a valor y
      en orden— **sigue verde con los cuatro valores** (QC-33 R35).

- [x] **T4 — Transiciones de estado.** `domain/order-transitions.ts` con la tabla `ALLOWED` de
      `design.md > 5` y `assertTransition`, más
      `tests/unit/pedidos/order-transitions.test.ts` con la matriz **completa** 4×4.
      *Depende de:* T1, T3. **Hecho cuando:** los 16 pares están cubiertos, los dos estados finales no
      admiten ni siquiera «quedarse igual», y ningún par tiene `CANCELADO` como destino (R22, R23,
      R24).

- [x] **T5 [P] — Esquemas de entrada.** `domain/order-input.ts`: `createOrderSchema`,
      `updateOrderSchema` (con `EDITABLE_STATUS` **derivado** de `ORDER_STATUS_VALUES`, no escrito a
      mano), `cancelOrderSchema`, `listOrdersSchema`. Más
      `tests/unit/pedidos/order-input.test.ts`.
      *Depende de:* T3. **Hecho cuando:** el test cubre cantidad cero y negativa, precio cero
      (aceptado) y negativo, prioridad y estado fuera del conjunto, motivo vacío / de espacios / de
      501 caracteres, `status: 'CANCELADO'` en la edición (rechazado) y que `createOrderSchema`
      **descarta** `status`, `createdBy` y el correlativo (R9, R17, R18, R19, R24, R27, R55).

- [x] **T6 [P] — Tipos de salida y puerto.** `domain/order-view.ts` (`OrderView`, `OrderSummary`,
      `NewOrder` con `status: EditableOrderStatus`, `OrderFilters`) y
      `ports/order-repository.ts` con los seis métodos de `design.md > 7.4`. Se **borra**
      `ports/.gitkeep`.
      *Depende de:* T5. **Hecho cuando:** `typecheck` limpio; `NewOrder` **no puede** expresar
      `CANCELADO` ni `cancellationReason` (un test de tipos o un `@ts-expect-error` lo demuestra); no
      hay campo `total` (R47, pregunta abierta 3).

---

## Grupo B — la migración (lo caro; no se paraleliza consigo misma)

- [x] **T7 — `migration.sql`.** Carpeta `db/migrations/<ts>_order_cancellation/`, escrita **entera a
      mano** siguiendo `design.md > 3.1–3.4` y `> 4.1`, con la cabecera de aviso de drift: `ADD VALUE`
      → `ADD COLUMN` → `CHECK` del motivo → `DROP`/`ADD` del `CHECK` de borrado → la función
      `next_order_sequence`.
      *Depende de:* T3. **Hecho cuando:** `pnpm run db:migrate` aplica sin errores contra Postgres
      real —**el fallo esperable aquí es el `55P04`** si alguien olvidó un `::text`— y una inspección
      del esquema muestra los seis `CHECK`, la columna y la función (R48, R51).

- [x] **T8 — `down.sql`.** Los cinco pasos de `design.md > 3.5`, con la **guardia de datos** del paso
      0 y la recreación del tipo. Nunca `ALTER TYPE ... DROP VALUE`.
      *Depende de:* T7. **Hecho cuando:** `db:migrate` → `db:rollback` → `db:migrate` cierra el ciclo
      y el esquema intermedio es **idéntico** al de QC-33 (mismo `CHECK` literal, sin columna, tipo de
      tres valores, sin función ni secuencias); **y** con un pedido `CANCELADO` en la tabla el
      rollback **aborta con el mensaje** y no modifica ninguna fila. Salida pegada en
      `progress/impl_QC-34-crud-de-pedidos.md` (R49, R50).

- [x] **T9 — Test estático de la migración.** `tests/unit/pedidos/schema/pedidos-migration.test.ts`,
      con las **seis mutaciones de sensibilidad** de `design.md > 12`.
      *Depende de:* T8. **Hecho cuando:** el predicado cae en las seis mutaciones. Un test que no
      puede fallar no vigila nada.

---

## Grupo C — el contrato de `recetas` (módulo ajeno, aditivo)

- [x] **T10 [P] — `RecipeCatalog` en `recetas`.** `domain/recipe-catalog.ts` gana `RecipeRef` y
      `RecipeCatalog.findRefsIncludingDeleted`; `adapters/driven/persistence/recipe-catalog-prisma.ts`
      lo implementa (una sola consulta `where: { id: { in: ids } }`, **sin** filtro de `deletedAt`,
      mapeando `isDeleted`); el barrel lo reexporta. Más
      `tests/unit/recetas/recipe-catalog.test.ts`.
      *Depende de:* T0. **Hecho cuando:** ninguna firma anterior de `recetas` cambió, todos los tests
      de QC-25 siguen verdes, y el nuevo demuestra que una receta dada de baja **vuelve** con
      `isDeleted: true` (R44).

---

## Grupo D — casos de uso (depende de A y C; no de la base)

- [x] **T11 — Los seis casos de uso.** `domain/{create,get,list,update,cancel,delete}-order.ts` como
      **factories** `createXxx(deps)`, con `requireAdmin` en la **primera línea** de las seis y el
      orden de `design.md > 6.4` en el listado.
      *Depende de:* T4, T6, T10. **Hecho cuando:** `typecheck` limpio y `cancelOrder` es el único que
      recibe y escribe `reason` (R26).

- [x] **T12 [P] — Tests de servicio.** `authorization.test.ts`, `order-service.test.ts`,
      `cancel-order.test.ts`, `delete-order.test.ts`, `list-orders.test.ts`, con **dobles del puerto y
      de los dos catálogos**.
      *Depende de:* T11. **Hecho cuando:** (a) los seis casos de uso rechazan al Operador **sin tocar
      ningún puerto** —dobles que lanzan si los llaman—; (b) `list-orders` demuestra con un contador
      de invocaciones que hay **una** llamada a cada catálogo por página, con ids deduplicados (R45);
      (c) la receta dada de baja trae nombre en el listado (R44) y se acepta al editar sin cambiarla,
      pero se rechaza al cambiarla (R25); (d) editar y borrar un `ENTREGADO`/`CANCELADO` fallan con su
      `code` propio (R21, R32).

- [x] **T13 — Adaptador driven.** `adapters/driven/persistence/order-prisma.ts`: el `INSERT` con
      `next_order_sequence($1)` de `design.md > 4.2` —**un solo reloj** para `created_at` y
      `order_year`—, el `ORDER BY` de `design.md > 10`, el filtro `deleted_at IS NULL` en las cuatro
      lecturas/escrituras `…Alive`, `toOffsetLimit`/`buildPage` y la traducción de SQLSTATE a
      resultados discriminados. Se **borra** `adapters/driven/.gitkeep`.
      *Depende de:* T7, T11. **Hecho cuando:** `typecheck` limpio; es el **único** archivo del módulo
      que importa `@prisma/client`; no hay ningún `include` hacia `recipe`, `unit` ni `user`.

---

## Grupo E — superficie y cableado

- [x] **T14 — Contrato y composición.** `lib/modules/pedidos/index.ts` reexporta tipos, esquemas,
      errores y las seis factories —**solo** de `./domain`—; `lib/composition/index.ts` gana el bloque
      nuevo **al final**, reutilizando `unitCatalog`, sin reordenar nada de lo existente.
      *Depende de:* T13. **Hecho cuando:** el barrel no arrastra `'use server'`, `@prisma/client` ni
      `next/*` en su cierre de imports; `guard-arquitectura-modulos` verde (R52).

- [x] **T15 — Server Actions.** `adapters/driving/order-actions.ts` con `'use server'`: `FormData` en
      crear, editar, cancelar y borrar; argumentos tipados en consultar y listar; actor de
      `identity.getSessionUser()`; traducción por `code`. Se **borra** `adapters/driving/.gitkeep`.
      Más `tests/unit/pedidos/order-actions.test.ts`.
      *Depende de:* T14. **Hecho cuando:** el test demuestra que una entrada inválida **no llega** al
      caso de uso (doble que falla si lo llaman), que el `code` viene de la clase y no del texto, y
      que no hay ningún route handler ni `fetch` a ruta propia (R5, R54, R56).

---

## Grupo F — integración contra Postgres real

- [x] **T16 — `order-crud.int.test.ts`.** R8, R10, R30, R32, R40, R41 contra la base: los **cuatro**
      casos del `CHECK` del motivo, los **seis** del `CHECK` de borrado, el `ORDER BY` con el enum, y
      el caso frontera del 31 de diciembre a las 20:00 en Ecuador contra el `CHECK` de QC-33 R41.
      *Depende de:* T13. **Hecho cuando:** todo lo que debe fallar va con `$executeRaw` y se afirma
      sobre el **SQLSTATE**, nunca sobre el texto; cada caso dentro de una transacción con `ROLLBACK`;
      `beforeAll` falla con un mensaje claro si falta la migración.

- [x] **T17 — `order-sequence.int.test.ts`.** R11, R12, R13: primera alta de un año, dos altas del
      mismo año, **dos altas concurrentes con dos conexiones distintas** siendo las dos la primera del
      año, un alta abortada que deja hueco, y un año nuevo que vuelve a arrancar en 1.
      *Depende de:* T13. **Hecho cuando:** el caso concurrente usa dos conexiones de verdad (no dos
      `await` en la misma) y ninguna de las dos altas falla.

---

## Grupo G — cierre

- [x] **T18 — Trazabilidad y gate.** *(Mapa `R<n> → test` completo y los tres `.gitkeep`
      comprobados como borrados. **El `./init.sh` completo lo corre el leader**, F2.2.)* Mapa `R<n> → test` completo en
      `progress/impl_QC-34-crud-de-pedidos.md`, `./init.sh` **completo** en verde, y los tres
      `.gitkeep` comprobados como borrados.
      *Depende de:* todo lo anterior. **Hecho cuando:** ningún `R<n>` de la tabla siguiente queda sin
      test y `CHECKPOINTS.md > Trazabilidad` se puede marcar.

---

## Trazabilidad `R<n> → test`

| Requisitos | Test |
| --- | --- |
| R1, R2, R3, R4 | `tests/unit/pedidos/authorization.test.ts` |
| R5, R54, R56 | `tests/unit/pedidos/order-actions.test.ts` |
| R6, R8, R9, R15, R16, R20, R21, R25, R33, R42, R46 | `tests/unit/pedidos/order-service.test.ts` |
| R7 | `tests/guards/guard-rls-force.test.ts` |
| R8, R10, R30, R32, R40, R41 (base real) | `tests/integration/pedidos/order-crud.int.test.ts` |
| R11, R12, R13 | `tests/integration/pedidos/order-sequence.int.test.ts` |
| R14 | `tests/unit/pedidos/domain/order-number.test.ts` (QC-33, se amplía con el uso en la vista) |
| R17, R18, R19, R24, R27, R36, R55 | `tests/unit/pedidos/order-input.test.ts` |
| R22, R23 | `tests/unit/pedidos/order-transitions.test.ts` |
| R26, R28, R29 | `tests/unit/pedidos/cancel-order.test.ts` |
| R31, R32 (aplicación), R33 | `tests/unit/pedidos/delete-order.test.ts` |
| R34, R35, R38, R39, R40, R41, R43, R44, R45 | `tests/unit/pedidos/list-orders.test.ts` |
| R44 (lado `recetas`) | `tests/unit/recetas/recipe-catalog.test.ts` |
| R47, R48, R49, R50, R51 | `tests/unit/pedidos/schema/pedidos-migration.test.ts` + T8 (ciclo real) |
| R37, R52, R53, R57, R58 | `tests/unit/pedidos/scope.test.ts` + `guard-arquitectura-modulos` + `guard-dependencias-aprobadas` |
