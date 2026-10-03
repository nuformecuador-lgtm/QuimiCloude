# QC-195 — envases-del-pedido-como-productos · tasks.md

> Escrito por `spec_author` en F1.2 y rehecho con las decisiones de F1.4 (2026-10-03): P1 = A
> (`unidad`, `u`), P2 = A, P3 = b, N1 y N7 = alternativa, el resto = recomendación
> (`design.md > 1`). **P4 decidida 2026-10-03 (A)**: T11 desbloqueada. Ninguna task empieza antes de la
> aprobación del spec.
>
> **Dos carriles en paralelo.** `backend_dev`: TC, T1-T11. `frontend_dev`: T12-T15. Las tasks de
> interfaz dependen **solo de TC** (el contrato de `design.md > 11`), nunca del backend real: prueban
> contra dobles de las acciones, que es como el repo ya prueba la UI. T16 (E2E) y T17 (cierre) juntan
> los dos carriles.
>
> Cada task cierra con `./init.sh --rapido` en verde y un commit (`feat(QC-195): …` /
> `test(QC-195): …`). La última, con `./init.sh` completo. Los tests llevan `R<n>` en el nombre del
> caso; el código de producción no cita fichas ni requisitos (`docs/conventions.md > Comentarios`).
> `[P]` = paralelizable con las que se indican.

## [x] T0 — Recontraste y P4 `[backend_dev]` `[P con TC]`

- Confirmar que las referencias `archivo:línea` de `design.md > 6` y `> 11` siguen valiendo sobre la
  punta de `dev`; anotar en `progress/impl_QC-195.md` las que se movieron.
- Correr la lista de `design.md > 8` sobre la punta y anotar cuáles están rojos de partida (deberían
  ser cero).
- Pedir al leader que el humano decida **P4** (`design.md > 1.5`) y, cuando lo haga, escribir su
  requisito en `requirements.md` y copiar la decisión a `design.md > 1.5`.

**Hecho cuando:** `progress/impl_QC-195.md` tiene el recontraste y el `./init.sh --rapido` de partida
en verde. (P4 decidida: A.)

## [x] TC — Contrato front↔back: tipos y firmas `[backend_dev]` `[bloquea a T12-T15]`

Escribe **solo** lo que `design.md > 11` marca como NEW en tipos exportados y constantes, sin
comportamiento. `docs/conventions.md` no fija una convención de stubs, y un código
`not_implemented` no existe en el catálogo (`guard-catalogo-de-errores` lo rechazaría), así que no se
añade ninguna acción falsa: las acciones existentes siguen haciendo lo de hoy y la UI prueba contra
dobles que devuelven las formas del contrato.

- `@/lib/modules/inventario`: campos opcionales `presentationId`, `presentationName`,
  `presentationContent`, `presentationUnitId` en `ProductView`; constante del nombre del filtro
  `presentationUnitId` (sin añadirlo todavía a `PRODUCT_QUERYABLE`, eso es T4).
- `@/lib/modules/pedidos`: `ORDER_DISTRIBUTION_PACKAGING_FIELD`; tipo `DistributionLineInput` (la
  unión de `design.md > 11.3`) **junto a** `PresentationLineInput`, sin sustituirlo todavía; tipo
  `UpdateOrderDistributionInput` con `confirmBlocked?`; variante `packaging_not_found` exportada como
  tipo aparte (`OrderPresentationAvailabilityNext`) para no romper los `switch` exhaustivos actuales;
  `packagingProductId`/`packagingName` opcionales en `OrderPresentationLineView`; `QuoteOrderCostInput`
  con `presentationLines?` como tipo.
- Tipo de cliente `OrderDistributionLine` con `packagingProductId`, `packagingName`, `available`
  opcionales.
- Un test de tipos (`expectTypeOf`) por cada forma de `design.md > 11`, para que el contrato no pueda
  cambiar sin que se note.

**Hecho cuando:** `typecheck` y `lint` verdes sin cambiar ningún comportamiento (la suite existente
sigue verde tal cual) y los tests de tipos verdes. A partir de aquí `design.md > 11` es fijo: si
backend necesita cambiarlo, lo dice antes en `progress/impl_QC-195.md` y avisa a `frontend_dev`.

## Carril backend

### [ ] T1 — Migración y esquema `[depende de T0]`

- `db/migrations/<ts>_packaging_products_in_distribution/migration.sql` y `down.sql`
  (`design.md > 2`): CHECK `products_finished_identity_matches_type` con cuerpo nuevo y mismo
  nombre; `products_company_id_id_key`; `order_presentation_lines.packaging_product_id` con su FK
  compuesta e índice; unidad de sistema `unidad`/`u`, base, idempotente.
- `db/schema.prisma`: `@@unique([companyId, id])` en `Product`, `packagingProductId` en
  `OrderPresentationLine`.
- Tests de migración (texto) y de integración: PRODUCT o MACHINE con presentación se rechaza,
  PACKAGING con presentación entra, FINISHED_PRODUCT sin receta se rechaza (R5); línea con envase de
  otra empresa se rechaza por FK; una línea de reparto sembrada antes de la migración queda intacta y
  sin apartados (R32).

**Hecho cuando:** `pnpm run db:migrate` aplica y `down.sql` revierte sobre una base de prueba; R5 y
R32 verdes; `inventario-constraints.int.test.ts` sigue verde.

### [ ] T2 — El envase en inventario: alta, lote y ajuste `[depende de T1]`

- `product-input.ts`: el alta de PACKAGING lleva la presentación en el producto; existencia entera en
  alta y ajuste (N3).
- `create-product.ts` y `product-prisma.ts`: el envase nace con `presentation_id` y unidad `u`; sus
  lotes sin presentación; homónimo con otra presentación se rechaza (N10); la presentación no se
  puede cambiar.

**Hecho cuando:** unit e integración verdes para **R1, R2, R3, R4, R6, R7**; los 6 casos PACKAGING de
`product-input.test.ts` reescritos contra R1/R7; los errores coinciden con `design.md > 11.9`.

### [ ] T3 — `PackagingCatalog` (solo servidor) `[depende de T1]` `[P con T2]`

- Puerto, adaptador Prisma, barrel y cableado. `findRefs` y `findCostingBatches` (`design.md > 3.1`).
  Sin listado: el selector va por T4.

**Hecho cuando:** integración verde: solo PACKAGING vivos, de la empresa y con presentación fija;
disponible y costo por envase; `guard-tipos-de-producto`, `guard-arquitectura-modulos` y
`guard-ambito-empresa-inventario` verdes.

### [ ] T4 — Listado de productos para el selector `[depende de T1, TC]` `[P con T2, T3]`

- `PRODUCT_QUERYABLE` gana `presentationUnitId: 'select'` (solo presentación fija con contenido).
- `listAliveProducts` rellena los cuatro campos de presentación de `ProductView`.

**Hecho cuando:** integración verde: con `type = PACKAGING` y `presentationUnitId = {l, ml}` salen
los envases en `l`/`ml` con contenido y no los de `kg`/`g` ni los legados (**R8, R9**); el disponible
incluye los de cero (**R10**); sin `inventario.consultar` responde `unauthorized` (**R38**, lado
servidor); los tests de listas blancas de `design.md > 8` ampliados y verdes.

### [ ] T5 — `consumeForOrder` por subconjunto de productos `[depende de T0]` `[P con T1-T4]`

- `MaterialReservations.consumeForOrder` gana `productIds?`; sin él, idéntico a hoy.

**Hecho cuando:** integración verde: con `productIds` solo consume esos lotes y deja intacto lo
demás; los tests de consumo existentes siguen verdes sin tocar.

### [ ] T6 — Necesidad, resolución del reparto y vistas `[depende de T3, TC]`

- `buildOrderRequirement` (receta + envases, fase, suma por producto).
- Resolución compartida de líneas (envase o antigua sin cambios) en `resolve-distribution.ts`,
  `order-presentation-availability.ts` y `update-order-presentation-lines.ts`; `order-input.ts` pasa a
  `DistributionLineInput` y `readPresentationLines` lee el campo nuevo; `PresentationLineInput` y
  `OrderPresentationAvailabilityNext` de TC sustituyen a los viejos.
- `getOrder`/`listOrders` devuelven `packagingProductId` y `packagingName` por línea.
- `order-distribution.ts` **no se toca**.

**Hecho cuando:** unit verdes para **R11, R12, R13, R14, R34, R35**, la necesidad de **R15** (40
botellas → línea de 40) y las vistas de **R33**; errores y formas iguales a `design.md > 11.3`,
`> 11.5` y `> 11.7`.

### [ ] T7 — Alta, edición y revisión de bloqueados con envases `[depende de T6]`

- `create-order.ts`, `update-order.ts`, `review-blocked-orders.ts` con `buildOrderRequirement`.

**Hecho cuando:** integración verde para **R15, R16, R17, R18 y R19 (edición completa), R21, R22,
R23**.

### [ ] T8 — «Reparto y unidad» toca la reserva `[depende de T6]` `[P con T7]`

- `update-order-presentation-lines.ts` sobre `OrderUnitOfWork`, con `confirmBlocked` y los dos
  resultados nuevos; `updateOrderDistributionAction` los traduce (`design.md > 11.4`).
- Reescribir `update-order-presentation-lines.test.ts:327` contra R15/R20.

**Hecho cuando:** verdes **R17, R18, R19, R20, R24** por esta vía; `qc170-*.int.test.ts` verdes.

### [ ] T9 — Costo de los envases `[depende de T3, T6]` `[P con T7, T8]`

- `calculatePackagingCost`/`calculateOrderCost`, `resolveOrderCost`, costeo del lote con envases;
  `quoteOrderCostSchema` con el reparto (`design.md > 11.6`).

**Hecho cuando:** unit verdes para **R27** (ejemplo `24.0000`), **R28, R29 (dominio), R30, R31**.

### [ ] T10 — Consumo al Terminar `[depende de T5, T7]`

- `transition-order.ts`: `POR_EMPACAR` consume solo receta.
- `order-packing.ts`: consume envases antes del alta del producto terminado;
  `finishPackingAction` devuelve `insufficient_material` (`design.md > 11.8`).

**Hecho cuando:** integración verde para **R25, R26**, **R14** (alta en la presentación copiada) y
**R33** (línea antigua termina como hoy).

### [ ] T11 — El envase no es ingrediente `[depende de T0 y de P4]` `[P con T1-T10]`

- `create-recipe.ts`, `create-recipe-version.ts`, `update-recipe.ts`, `update-recipe-version.ts`,
  `preview-formula-import.ts`, `confirm-formula-import.ts`: rechazan o excluyen PACKAGING con
  `action_not_allowed` (`design.md > 3.5`), con una sola función de tipos elegibles del contrato de
  `inventario`.
- Lo que P4 decida sobre las recetas que ya tienen un envase (líneas existentes y versiones copiadas).

**Hecho cuando:** unit verdes para **R39, R40, R41** y el requisito de P4; los casos de
FINISHED_PRODUCT siguen verdes sin tocar; `guard-tipos-de-producto` verde.

## Carril frontend (dependen solo de TC)

### [ ] T12 — Selector de envases `[frontend_dev]` `[depende de TC]` `[P con T13-T15 y con todo el carril backend]`

- `PackagingSelect` en `app/(private)/pedidos/components/`, sobre `listProductsAction` con la
  consulta de `design.md > 11.2`. Firma de props (la usa T13 sin esperar a esta task):

  ```ts
  type PackagingOption = Pick<ProductView, 'id' | 'name' | 'presentationId' | 'presentationName'
    | 'presentationContent' | 'presentationUnitId' | 'available'>;
  type PackagingSelectProps = {
    readonly unitIds: readonly string[];          // compatibleUnitIds del pedido
    readonly onSelect: (option: PackagingOption | null) => void;
    readonly disabled?: boolean;
  };
  ```
- Pinta nombre, presentación y disponible; con `unauthorized` muestra el aviso de permiso y no lista
  nada.

**Hecho cuando:** unit de UI con doble de `listProductsAction` verdes para **R8, R10, R38**.

### [ ] T13 — Formulario del pedido y diálogo «Reparto y unidad» `[frontend_dev]` `[depende de TC]` `[P con T12, T14, T15]`

- `order-distribution-field.tsx`, `order-form.tsx`, `use-order-distribution-availability.ts`,
  `use-saved-line-contents.ts`, `use-order-cost-quote.ts`: líneas con envase y campo
  `ORDER_DISTRIBUTION_PACKAGING_FIELD`; líneas antiguas marcadas y reenviadas sin cambios; la
  cotización se recalcula al cambiar el reparto. Usa `PackagingSelect` por la firma de T12, con un
  doble en sus tests.
- Diálogo «Reparto y unidad» con la confirmación de `order_would_block` y reenvío con
  `confirmBlocked: true`; `insufficient_material` como error.

**Hecho cuando:** unit de UI verdes para **R29 (UI), R36, R37** y el lado de interfaz de **R17,
R35**; tests de `pedidos-ui` adaptados.

### [ ] T14 — Inventario: formulario y panel de lotes del envase `[frontend_dev]` `[depende de TC]` `[P con T12, T13, T15]`

- `product-form.tsx`: presentación en el producto para Envase, existencia entera en envases.
- `product-batches-panel.tsx`: lote de envase en `u`, con la presentación del producto.
- Marca del envase legado sin presentación fija.

**Hecho cuando:** unit de UI verdes para **R1, R6, R7** en la interfaz.

### [ ] T15 — Lecturas con líneas antiguas y con envase `[frontend_dev]` `[depende de TC]` `[P con T12-T14]`

- Ficha, listado, pantalla de empaque y de ejecución pintan `packagingName` y, si es `null`, la
  presentación como hoy.

**Hecho cuando:** unit de UI verdes para **R33** en la interfaz.

## Cierre

### [ ] T16 — E2E `[depende de T1-T15]`

- Adaptar las E2E de `design.md > 8` sembrando envases. Nueva: pedido en litros con un envase de
  500 ml y otro de 1 l, 40 botellas apartadas, falta de envase con aviso y `BLOQUEADO`, cotización
  con el envase sumado, Terminar consumiendo los envases; receta que rechaza un envase como
  ingrediente.
- Una E2E a la vez; borrar `.next/dev/types` antes.

**Hecho cuando:** las E2E de pedidos, empaque, producto terminado, cotización, reserva y recetas
verdes.

### [ ] T17 — Cierre `[depende de todas]`

- `./init.sh` completo en verde.
- `progress/impl_QC-195.md` con el mapa `R1..R41 -> test` (más el de P4) sin huecos, y los tests de
  `design.md > 8` reescritos con su motivo.
- Limpieza de comentarios en las líneas tocadas.

**Hecho cuando:** gate completo verde y trazabilidad completa.

## Mapa R -> task

| R | Task | R | Task | R | Task |
|---|---|---|---|---|---|
| R1 | T1, T2, T14 | R15 | T6, T7, T8 | R29 | T9, T13 |
| R2 | T2 | R16 | T7 | R30 | T9 |
| R3 | T2 | R17 | T7, T8, T13 | R31 | T9 |
| R4 | T2 | R18 | T7, T8 | R32 | T1 |
| R5 | T1 | R19 | T7, T8 | R33 | T6, T10, T15 |
| R6 | T2, T14 | R20 | T8 | R34 | T6 |
| R7 | T2, T14 | R21 | T7 | R35 | T6, T13 |
| R8 | T4, T12 | R22 | T7 | R36 | T13 |
| R9 | T4 | R23 | T7 | R37 | T13 |
| R10 | T4, T12 | R24 | T8 | R38 | T4, T12 |
| R11 | T6 | R25 | T10 | R39 | T11 |
| R12 | T6 | R26 | T10 | R40 | T11 |
| R13 | T6 | R27 | T9 | R41 | T11 |
| R14 | T6, T10 | R28 | T9 | P4 | T11 |
