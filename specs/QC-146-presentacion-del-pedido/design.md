# QC-146 — presentacion-del-pedido · design.md

> Diseño técnico de `R1`–`R30` de `requirements.md`. El Alcance y las trece decisiones cerradas
> (`[D1]`–`[D13]`, citadas por su orden en la tabla) vienen de `/afinar-feature` (2026-09-22) y
> aquí no se reabren. Lo que este archivo decide es lo que la acotación dejó al diseño: cómo habla
> `pedidos` (y `asignaciones`) con el catálogo de presentaciones de `inventario`, la migración, los
> contratos y dónde se pinta.

---

## 0. Lo verificado en el código (no supuesto)

Leído en la rama `feature/QC-146-presentacion-del-pedido` (base `origin/dev` `7c7aef80`) el
2026-09-22.

| Hecho | Dónde |
|---|---|
| `Order` no tiene unidad, ni precio, ni presentación. Tiene `quantity Decimal(14,4)`, `priority`, `status`, `ingredientsCost Decimal?`, `companyId` y borrado lógico (`deletedAt`) | `db/schema.prisma:542-569` |
| Las FK de `orders` hacia otros módulos van **sin `@relation`** y escritas a mano: son drift de Prisma y hay que borrar su `DROP CONSTRAINT` de toda migración generada | `db/schema.prisma:532-541`; `db/migrations/20260915120000_orders_company_scope/migration.sql:8-10`, `:120-124` |
| `Presentation` es de `inventario`, **sin borrado lógico** (el borrado es físico y lo bloquean las FK `RESTRICT`), con la clave candidata `presentations_company_id_id_key (company_id, id)` | `db/schema.prisma:240-263` |
| Precedente exacto de FK compuesta hacia la presentación: `supplier_catalog_lines_company_id_presentation_id_fkey`, `FOREIGN KEY (company_id, presentation_id) REFERENCES presentations(company_id, id) ON DELETE RESTRICT ON UPDATE CASCADE` | `db/migrations/20260917120000_suppliers_company_scope/migration.sql:184-199` |
| La última migración del repo es de `20260918130000` (tres con ese prefijo) | `db/migrations/` |
| `orders` ya tiene RLS activada y forzada | `db/migrations/20260915120000_orders_company_scope/migration.sql:198-199` |
| El borrado de presentación traduce **cualquier** `P2003` a `'in_use'` → `PresentationInUseError` (`presentation_in_use`) | `lib/modules/inventario/adapters/driven/persistence/presentation-prisma.ts:82-84`, `:267-280`; `lib/modules/inventario/domain/delete-presentation.ts:39` |
| El código `presentation_not_found` **ya existe** en el catálogo cerrado de errores (lo usa `inventario`) | `lib/modules/errores/domain/error-codes.ts:22`; `error-catalog.ts:12`, `:75` |
| `pedidos` ya comparte un código con otro módulo con el mismo criterio: `recipe_not_found` | `lib/modules/pedidos/domain/errors.ts:66-82` |
| `inventario` publica `ProductCatalog` por su barrel y **no** publica ningún catálogo de presentaciones | `lib/modules/inventario/index.ts:85-87`; `domain/product-catalog.ts` |
| `pedidos` y `asignaciones` ya consumen el contrato de `inventario` (`ProductCatalog`) cableado desde composición | `lib/modules/pedidos/domain/create-order.ts:9`; `lib/modules/asignaciones/domain/get-assigned-order-execution.ts:11`; `lib/composition/index.ts:740`, `:972-987`, `:1117-1139` |
| `updateOrderSchema` es `createOrderSchema.shape` + `status`: un campo nuevo del alta llega solo a la edición | `lib/modules/pedidos/domain/order-input.ts:72-102` |
| El alta inserta por SQL crudo con columnas enumeradas; la edición es `updateMany` con ámbito | `lib/modules/pedidos/adapters/driven/persistence/order-prisma.ts:167-248`, `:521-542` |
| El listado resuelve nombres de receta con **una** llamada por página, deduplicando ids | `lib/modules/pedidos/domain/list-orders.ts:150-162` |
| `toOrderView` es la única composición de la salida, compartida por ficha y listado | `lib/modules/pedidos/domain/get-order.ts:38-60` |
| `AssignedOrderSummary` (lo que `pedidos` publica a `asignaciones`) lleva `recipeId`, `quantity`, `priority`, `status` | `lib/modules/pedidos/domain/order-catalog.ts:84-91` |
| Ya existe un selector compartido de presentación, con búsqueda al servidor, campo de formulario `presentationId`, `required`, objetivos táctiles de 44 px y 16 px de texto. **Sin la prop `units` no ofrece crear** | `components/shared/presentation-select.tsx:35`, `:94-98`, `:211`, `:414-425`, `:516` |
| Ese selector carga con `listPresentationsAction`, que exige `inventario.consultar`; el Administrador lo tiene | `lib/modules/inventario/domain/list-presentations.ts:43`; `lib/modules/identity/domain/permissions.ts:150` |
| El Operador tiene exactamente `inventario.consultar` y `asignaciones.consultar` | `lib/modules/identity/domain/permissions.ts:165` |
| El esqueleto del listado de pedidos declara 9 columnas; el de asignados, 7 | `app/(private)/pedidos/components/order-list-skeleton.tsx:41`; `app/(private)/asignacion/components/assigned-orders-skeleton.tsx:12` |
| Dos E2E crean pedidos **por la UI** (tendrán que elegir presentación); tres los insertan con Prisma (no se ven afectados, la columna es opcional) | UI: `e2e/pedidos.spec.ts:359-379`, `e2e/aislamiento-pedidos.spec.ts:418`. Prisma: `e2e/ejecucion-receta.spec.ts:187`, `e2e/pedidos-asignados.spec.ts:159`, `e2e/pedidos-responsables.spec.ts:435` |
| La guardia de ámbito de `inventario` barre **todos** los archivos de `adapters/driven/persistence/` | `tests/guards/guard-ambito-empresa-inventario.test.ts:301` |

---

## 1. Modelo de datos y migración (R1–R5)

### 1.1 Columna y FK

```prisma
model Order {
  // ...
  presentationId String? @map("presentation_id") @db.Uuid
  // ...
  @@index([presentationId], map: "orders_presentation_id_idx")
}
```

- **Opcional** (`R2`, `[D3]`): los pedidos existentes quedan en `NULL` y la base no puede exigirla
  sin un valor por defecto que `[D3]` prohíbe. La obligatoriedad de alta y edición es **de la
  aplicación** (`R6`, `R7`), ver `> 3`.
- **Sin `@relation`** (`[D5]` + la regla de módulos): `Presentation` es de `inventario` y un
  `include` desde `pedidos` cruzaría la frontera. La FK es drift, igual que `recipe_id` y
  `company_id` de la misma tabla, y el comentario del modelo lo dirá en una línea.
- **Nombre en inglés** (`R5`, `[D12]`): `presentation_id` / `presentationId`.

`db/migrations/<ts>_orders_presentation/migration.sql` (UP):

```sql
ALTER TABLE "orders" ADD COLUMN "presentation_id" UUID;

CREATE INDEX "orders_presentation_id_idx" ON "orders" ("presentation_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_presentation_id_fkey"
  FOREIGN KEY ("company_id", "presentation_id") REFERENCES "presentations" ("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

`down.sql` (DOWN), en orden inverso: `DROP CONSTRAINT "orders_company_id_presentation_id_fkey"`,
`DROP INDEX "orders_presentation_id_idx"`, `DROP COLUMN "presentation_id"`. Es **destructivo a
conciencia**: revertir pierde las presentaciones elegidas, que no se pueden recalcular. Queda
escrito aquí para que nadie lo descubra al hacer rollback.

**Por qué funciona con los pedidos viejos.** La FK es `MATCH SIMPLE` (el defecto de Postgres, el
mismo que QC-60 eligió a propósito para el grupo de `order_assignments`): con `presentation_id`
nulo la fila no se comprueba. Con un valor, se comprueba el **par** `(company_id,
presentation_id)` contra la clave candidata de `presentations`, así que una presentación de otra
empresa es imposible por construcción (`R3`, `[D5]`).

**Por qué `RESTRICT` basta para `R4`.** La FK apunta también desde pedidos cancelados, entregados
y dados de baja lógicamente —la baja es un `UPDATE`, la fila sigue ahí—, así que ninguno deja
borrar la presentación. El adaptador de `inventario` ya traduce cualquier `P2003` del borrado a
`'in_use'` (`presentation-prisma.ts:82-84`, `:280`): **no hay que tocar `inventario` para `R4`**.
El comentario de esa función dice que la única FK es la de lotes; ya era falso desde QC-59
(`supplier_catalog_lines`) y lo sigue siendo. No se corrige aquí: es un archivo que esta ficha no
necesita tocar (ver pregunta abierta 1 para el texto del error).

**Índice.** `orders_presentation_id_idx` existe para el `RESTRICT`: sin él, cada intento de borrar
una presentación recorre `orders` entera. Mismo criterio y mismo nombre de patrón que
`supplier_catalog_lines_presentation_id_idx` (`db/schema.prisma:483`). No se indexa para listar:
`[D9]` cierra que no se ordena ni se filtra por presentación.

**Sin backfill, sin `UPDATE`, sin `NO FORCE`.** Es DDL puro sobre una columna nueva y nula; la RLS
forzada de `orders` no interviene y la validación de la FK sobre filas nulas no lee nada.

**Timestamp.** Estrictamente mayor que el último de `db/migrations/` en el momento de crearla
(hoy `20260918130000`). Propuesta: `20260922120000`. QC-147 está en curso en la misma zona y puede
añadir su propia migración: si al crear la de esta ficha ya existe una más reciente, se elige otra
mayor. Dos migraciones con el mismo timestamp se aplican en orden alfabético, que no es un orden
que nadie haya decidido.

**Sin tabla nueva**: `guard-empresa-en-esquema` no cambia y no hace falta RLS nueva.

---

## 2. Cómo se resuelve el nombre: `PresentationCatalog` de `inventario` (R22, R23, R24, R25, R28)

**Decisión: `inventario` publica un contrato nuevo, `PresentationCatalog`, con el mismo mecanismo
que `ProductCatalog`. No nace ningún puerto en `pedidos/ports/` ni en `asignaciones/ports/`.**

```ts
// lib/modules/inventario/domain/presentation-catalog.ts
export type PresentationId = string;

/** Lo que otro modulo puede saber de una presentacion: identidad y nombre. */
export type PresentationRef = {
  readonly id: PresentationId;
  readonly name: string;
};

export interface PresentationCatalog {
  /** Las presentaciones de esa empresa entre los ids pedidos. Un id que no existe o que es de
   *  otra empresa simplemente no vuelve. Con `ids` vacio no consulta. */
  findRefs(
    ids: readonly PresentationId[],
    companyId: string,
  ): Promise<readonly PresentationRef[]>;
}
```

- Barrel: `export type { PresentationCatalog, PresentationId, PresentationRef } from
  './domain/presentation-catalog';` (solo tipos: el contrato sigue siendo client-safe).
- Implementación: **archivo nuevo** `lib/modules/inventario/adapters/driven/persistence/
  presentation-catalog-prisma.ts`, con `findPresentationRefs(ids, companyId)` pública y una función
  interna que declara `scope: InventoryScope` y lo lleva a `presentationCompanyScope`
  (`company-scope.ts:52`) en un `AND` aparte del `id: { in }`. Es exactamente la forma de
  `product-catalog-prisma.ts`, y es lo que exige `guard-ambito-empresa-inventario`.
  `select: { id: true, name: true }`. Sin condición de vida: `presentations` no tiene borrado
  lógico.
- **Archivo nuevo y no una función más en `presentation-prisma.ts`**: ese archivo lo toca QC-121
  (`specs/QC-121-.../tasks.md`, T8) y separar el contrato público del repositorio interno es además
  el patrón del módulo (`product-catalog-prisma.ts` frente a `product-prisma.ts`).
- Composición: `const presentationCatalog: PresentationCatalog = { findRefs: findPresentationRefs };`
  junto a `productCatalog` (`lib/composition/index.ts:740`), y se pasa como `presentations` a los
  seis casos de uso de `> 3` y `> 5`.

**Por qué no `ProductCatalog` ampliado.** Una presentación no es un producto; su docblock dice a
propósito que no expone la presentación (`domain/product-catalog.ts:10-13`). Y el alta tiene que
comprobar una presentación **aunque no haya producto** de por medio.

**Por qué el nombre se resuelve al leer y no se guarda.** Ver alternativa 1 en `> 9`.

**`R28` por construcción:** la única vía por la que `pedidos` y `asignaciones` obtienen un nombre de
presentación es `findRefs(ids, actor.companyId)`, y la empresa sale del actor, nunca de la entrada.

---

## 3. `pedidos`: contratos y casos de uso (R6–R14, R20–R23, R27)

### 3.1 Entrada

`order-input.ts`: `presentationIdSchema = z.string().uuid()` y `createOrderSchema` gana
`presentationId: presentationIdSchema` **obligatorio**. `updateOrderSchema` lo hereda por
`...createOrderSchema.shape`, así que la edición lo exige igual (`R7`) sin una línea más. Un pedido
viejo sin presentación se edita enviando una: no hay rama especial.

`order-actions.ts` (`buildCreateCandidate`) lee `presentationId` del `FormData` con
`readFormString`, como `recipeId`. La edición lo hereda (`buildUpdateCandidate`).

### 3.2 Tipos

| Tipo | Cambio |
|---|---|
| `NewOrder` | `presentationId: string` (obligatorio: toda escritura lo lleva) |
| `OrderRow` | `presentationId: string \| null` |
| `OrderView` / `OrderSummary` | `presentationId: string \| null` y `presentationName: string \| null` |
| `AssignedOrderSummary` (`order-catalog.ts`) | `presentationId: string \| null` (`R27`) |

`presentationName` es `null` si el pedido está sin presentación. El caso «tiene id pero el catálogo
no lo devuelve» no puede darse —la FK compuesta con `RESTRICT` impide que la presentación
desaparezca o sea de otra empresa—, y si se diera por una vía fuera de la aplicación se pinta
igual, «Sin presentación». No se añade un tercer estado para un caso que la base hace imposible.

`presentationId` viaja en `OrderView` porque la edición lo necesita para precargar el selector
(`R18`); en `AssignedOrderView` **no** viaja: el Operador no escribe (`R26`).

### 3.3 Errores

`PresentationNotFoundError` en `pedidos/domain/errors.ts`, con el código **compartido**
`presentation_not_found`, que ya está en el catálogo: mismo criterio que `RecipeNotFoundError` con
`recetas`. No cambia el catálogo de errores ni su test. Se exporta por el barrel junto a las demás.

### 3.4 Casos de uso

Orden de `createOrder` (`R12`, `R6`, `R8`):
`requirePermission` → zod → receta viva (como hoy) → **presentación**:
`deps.presentations.findRefs([data.presentationId], actor.companyId)`; vacío →
`PresentationNotFoundError` → coste (como hoy, **sin** pasarle la presentación: `R13`) → escribir.

Orden de `updateOrder` (`R7`–`R10`, `R12`): `requirePermission` → zod → `findAliveById` →
`assertTransition` (un `ENTREGADO`/`CANCELADO` muere aquí, `R10`, antes de consultar nada más) →
receta si cambia (como hoy) → **presentación, siempre** → coste → escribir.

La presentación se comprueba **siempre** en la edición, cambie o no: es una consulta de un id y
evita una rama «si cambió» que habría que probar aparte. Con un pedido viejo sin presentación,
`row.presentationId` es `null` y la entrada trae una: la comprobación es la misma.

`cancelOrder` y `deleteOrder` **no cambian** (`R11`): no pasan por `updateOrderSchema` ni por el
catálogo de presentaciones, así que un pedido sin presentación se cancela y se da de baja como
hoy. Se prueba para que nadie los «arregle» añadiéndoles la exigencia.

`getOrder` y `listOrders` ganan `presentations` en sus deps. `toOrderView(row, recipeNames,
presentationNames)` compone `presentationName`. `listOrders` deduplica los `presentationId` **no
nulos** de la página y hace **una** llamada a `findRefs`, y **ninguna** si no hay ids (`R22`).
El test de `list-orders` que cuenta invocaciones de puerto pasa de «dos sin búsqueda» a «tres con
alguna presentación en la página / dos sin ninguna».

`ORDER_QUERYABLE` **no** gana el campo (`R21`): un `sort` o un `filter` por `presentationName` o
`presentationId` se poda y se anota en el log como cualquier campo no declarado.

### 3.5 Adaptador driven

`order-prisma.ts`:
- `ORDER_SELECT` gana `presentationId: true`; `toOrderRow` lo copia.
- `createOrder`: el `INSERT` crudo gana la columna `"presentation_id"` con `${data.presentationId}::uuid`,
  y el `OrderRow` devuelto lleva `presentationId: data.presentationId`.
- `updateAliveOrder`: `data` gana `presentationId: data.presentationId`.
- `cancelAliveOrder` y `softDeleteAliveOrder` **no** la tocan (`R5`, `R11`).

`order-catalog-prisma.ts`: el `select` de `listAliveSummariesByIds` gana `presentationId: true` y el
mapeo lo copia (`R27`). `findAliveById` sigue con `{ id, status }`.

**Carrera aceptada.** Entre la comprobación del catálogo y el `INSERT`/`UPDATE` alguien podría
borrar la presentación (borrado físico). La FK lo rechaza con `23503`, que hoy no se traduce y llega
como `unexpected`. Es **el mismo trato que ya tiene la receta** —se comprueba antes y la carrera no
se traduce— y la ventana es de milisegundos sobre una operación de configuración. No se añade
traducción: el adaptador del alta lee el SQLSTATE sin nombre de restricción (`order-prisma.ts:
108-121`) y un `23503` genérico no se puede atribuir a la presentación con seguridad.

---

## 4. Lo que la presentación NO toca (R13, R14, R15, R30)

- `resolve-ingredients-cost.ts` y `order-cost.ts`: **sin cambios**; la presentación no se les pasa.
- `inventario`: los casos de uso de pedidos no reciben ningún método que escriba; `PresentationCatalog`
  es de solo lectura por construcción. Ningún movimiento, ninguna existencia (`R14`).
- `lib/modules/identity/domain/permissions.ts`: no se toca (`R15`).
- `package.json` y `docs/dependencias.md`: no se tocan (`R30`). Todo lo que hace falta —zod, el
  selector compartido, el autocompletado— ya está en el repo.

---

## 5. `asignaciones` (R24–R27)

| Archivo | Cambio |
|---|---|
| `domain/assigned-order-view.ts` | `AssignedOrderView` gana `presentationName: string \| null` |
| `domain/assigned-order-execution-view.ts` | `AssignedOrderExecutionView` gana `presentationName: string \| null` |
| `domain/list-assigned-orders.ts` | deps gana `presentations: PresentationCatalog`; una llamada por página con los ids no nulos, ninguna sin ids |
| `domain/get-assigned-order-execution.ts` | deps gana `presentations`; una llamada con el id del resumen si no es nulo |

La autorización no cambia: los dos casos de uso ya exigen `asignaciones.consultar` y no
`pedidos.consultar` (`list-assigned-orders.ts:62`, `get-assigned-order-execution.ts:40`), así que el
Operador ve la presentación sin permiso nuevo (`R26`). La vista no lleva `presentationId` ni ningún
control: no hay nada que escribir.

**QC-145** leerá la presentación del mismo `AssignedOrderSummary` (`R27`); esta ficha no pinta
terminados (`[D10]`).

---

## 6. UI (R16–R21, R24–R26)

### 6.1 Panel de alta y edición de `/pedidos` (`order-form.tsx`)

- Se **reutiliza** `PresentationSelect` de `components/shared/presentation-select.tsx`, **sin** la
  prop `units`: así no ofrece «Crear presentación» (`R17`; el componente lo documenta en
  `:94-98` y lo decide en `:211`, `:516`). No se modifica el componente.
- Va en la columna de campos, **entre Cantidad y Prioridad**.
- `defaultValue = order?.presentationId ?? ''` y `defaultLabel = order?.presentationName ?? ''`
  (`R18`): con nombre no consulta al montar. Un pedido viejo arranca con el campo vacío y el `input`
  espejo `required` más la validación previa impiden guardar (`R18`).
- `ORDER_BUSINESS_FIELDS` gana `PRESENTATION_FIELD` (importado del selector, no reescrito);
  `FIELD_MESSAGES.presentationId = 'Elige una presentación de la lista.'`;
  `CODE_TO_FIELD.presentation_not_found = 'presentationId'` (`R19`).
- El panel no gana ninguna consulta propia: el selector pide sus páginas con
  `listPresentationsAction`, acotada a la empresa del actor en el servidor (`R16`).

### 6.2 Marca «Sin presentación»

Componente nuevo `components/shared/order-presentation-label.tsx`:
`OrderPresentationLabel({ name }: { name: string | null })` pinta el nombre o «Sin presentación»,
con `data-testid="order-presentation"` y `data-missing` cuando no hay. Va a `components/shared/`
porque lo usan **dos** rutas (`/pedidos` y `/asignacion`) con la misma API, que es la condición de
`docs/architecture.md > Regla: sin sobre-ingeniería`. El texto vive una sola vez.

No se reutiliza el `MissingValue` («—») de las dos rutas: `[D9]` pide que se lea «sin
presentación», que es un dato del pedido y no «no se pudo cargar».

### 6.3 Listado de `/pedidos` (`order-columns.tsx`, `order-list-skeleton.tsx`)

Columna nueva `id: 'presentationName'`, `label: 'Presentación'`, `align: 'start'`, **después de
Cantidad**, **sin** `sortable` y **sin** `filter` (`R20`, `R21`). Celda:
`<OrderPresentationLabel name={order.presentationName} />`. `ORDER_SKELETON_COLUMN_COUNT` pasa de
9 a 10.

### 6.4 `/asignacion`

- Lista (`assigned-orders-columns.tsx`): columna `presentationName`, «Presentación», después de
  Cantidad, sin ordenar ni filtrar. `ASSIGNED_ORDERS_SKELETON_COLUMN_COUNT` pasa de 7 a 8 (`R24`).
- Ejecución (`order-execution-screen.tsx`): una línea propia **después del nombre de la receta**,
  «Presentación: » + `OrderPresentationLabel`, con `data-testid="order-execution-presentation"`
  (`R25`). Se añade como bloque aislado, sin reordenar lo que hay, porque QC-147 retira de esta
  misma pantalla el banner de escala: cuanto menos se toque alrededor, más limpia la integración.

### 6.5 Multiplataforma

Sin excepción que declarar. El selector ya cumple 44×44 px y 16 px en todos los anchos
(`presentation-select.tsx:37`, `:43`), no depende de `:hover` y usa los mismos primitivos que el
selector de receta del mismo panel. Las columnas y la línea de ejecución son texto. Nada de
`100vh`.

---

## 7. Composición

```ts
// lib/composition/index.ts
const presentationCatalog: PresentationCatalog = { findRefs: findPresentationRefs };

createOrder:  createCreateOrder({ ..., presentations: presentationCatalog }),
updateOrder:  createUpdateOrder({ ..., presentations: presentationCatalog }),
getOrder:     createGetOrder({ orders: orderRepository, recipes: recipeCatalog, presentations: presentationCatalog }),
listOrders:   createListOrders({ ..., presentations: presentationCatalog }),
listAssignedOrders:        createListAssignedOrders({ ..., presentations: presentationCatalog }),
getAssignedOrderExecution: createGetAssignedOrderExecution({ ..., presentations: presentationCatalog }),
```

`cancelOrder`, `deleteOrder`, `finishAssignedOrder` no lo reciben: no lo
usan, y cablear una dependencia que no se usa es lo que QC-35bis quitó de `getOrder`.

> **Enmienda F2.1 (2026-09-22, aceptada en la review F2.2).** `startAssignedOrder` **sí** recibe
> `presentations`: `StartAssignedOrderDeps = GetAssignedOrderExecutionDeps & {...}` y el caso de
> uso envuelve `createGetAssignedOrderExecution`, así que la dependencia es obligatoria por tipo, y
> la vista que devuelve ya lleva `presentationName`. No es cablear algo que no se usa.

---

## 8. E2E (R29)

Se **amplía** `e2e/pedidos.spec.ts`, caso «el Administrador entra, da de alta un pedido…» (R48 de
QC-35): la siembra crea una presentación de la empresa del test (con una unidad ya sembrada ahí
mismo), el recorrido la elige en el panel y afirma que la fila del listado muestra su nombre y que
la fila de la base guarda su id. La limpieza borra los pedidos **antes** que la presentación: el
`RESTRICT` de `R4` lo exige.

`e2e/aislamiento-pedidos.spec.ts` también da de alta por la UI (`:418`): gana su propia presentación
de la empresa A en la siembra y la elige. No se le añade ninguna afirmación nueva; solo deja de
romperse. Los tres E2E que insertan pedidos con Prisma no cambian.

---

## 9. Alternativas descartadas

1. **Guardar el nombre de la presentación en el pedido** (una foto, como `work_group_name` en
   `order_assignments`). Descartada: `[D5]` y `[D6]` piden una **referencia** con FK, y la foto
   sería una segunda verdad que un renombrado en Configuración dejaría desfasada sin avisar. Además
   sin FK no habría `RESTRICT` y `R4` no se podría cumplir.
2. **Resolver el nombre con un `JOIN` desde el adaptador de `pedidos`** (un `include` o SQL crudo
   contra `presentations`). Descartada: `presentations` es de `inventario`, y consultar un modelo
   ajeno es exactamente lo que `guard-arquitectura-modulos` y `docs/architecture.md > Dominio` n.º 2
   prohíben. El contrato publicado cuesta una consulta por página, no una por fila.
3. **Columna `NOT NULL` con un valor por defecto o un backfill a «la presentación más usada».**
   Descartada por `[D3]` y la regla 6: sería inventar un envase que nadie eligió.
4. **Hacer la presentación obligatoria solo en el formulario** y opcional en el esquema del caso de
   uso. Descartada: `[D3]` la hace obligatoria al crear y editar, y el cliente nunca es la frontera;
   cualquier otra vía de escritura la saltaría.
5. **Un `CHECK` que exija presentación a los pedidos creados desde una fecha.** Descartada: la regla
   es de alta y edición, no de fecha de creación (un pedido viejo que se edita también la necesita,
   y uno que se cancela no), y una fecha mágica en la base no expresa eso.
6. **FK simple `presentation_id → presentations(id)` y comprobar la empresa en el caso de uso.**
   Descartada por `[D5]`: la decisión es «imposible por construcción», y con FK simple una escritura
   por otra vía podría cruzar empresas.
7. **Ampliar `ProductCatalog` en vez de un contrato nuevo.** Descartada en `> 2`.

---

## 10. Trazabilidad `R<n> → test`

Los nombres de caso llevan el `R<n>` (`docs/conventions.md > Comentarios`). Donde dice «(nuevo)» el
archivo no existe hoy; donde no, se amplía uno existente.

| R | Test | Nivel |
|---|---|---|
| R1 | `tests/integration/pedidos/pedidos-constraints.int.test.ts` › «R1: guarda y relee un pedido con una presentación de su empresa» | integración |
| R2 | `tests/unit/pedidos/schema/orders-presentation-migration.test.ts` (nuevo) › «R2: la columna nace anulable, sin DEFAULT, sin UPDATE, y el down.sql revierte cada objeto»; `pedidos-constraints.int.test.ts` › «R2: un pedido sin presentación se acepta y se relee con ausencia de valor» | unidad + integración |
| R3 | `pedidos-constraints.int.test.ts` › «R3: rechaza una presentación de otra empresa y una inexistente con 23503» | integración |
| R4 | `pedidos-constraints.int.test.ts` › «R4: borrar una presentación usada por un pedido vivo, cancelado o dado de baja se rechaza con 23503 y deja las dos filas»; `tests/unit/inventario/presentation-service.test.ts` (existente, `in_use` → `presentation_in_use`) | integración + unidad |
| R5 | `tests/integration/pedidos/order-crud.int.test.ts` › «R5: la baja lógica conserva la presentación»; `orders-presentation-migration.test.ts` › «R5: la columna se llama presentation_id» | integración + unidad |
| R6 | `tests/unit/pedidos/order-input.test.ts` › «R6: el alta sin presentación o con un id mal formado no pasa el esquema»; `tests/unit/pedidos/create-order.test.ts` › «R6: sin presentación lanza invalid_input y no escribe» | unidad |
| R7 | `order-input.test.ts` › «R7: la edición exige presentación»; `tests/unit/pedidos/update-order.test.ts` › «R7: editar un pedido sin presentación exige elegir una» | unidad |
| R8 | `create-order.test.ts` y `update-order.test.ts` › «R8: presentación ausente del catálogo de la empresa → presentation_not_found, sin escribir»; `tests/unit/pedidos/company-isolation-service.test.ts` › «R8: una presentación de otra empresa se rechaza como inexistente» | unidad |
| R9 | `update-order.test.ts` › «R9: un pedido PENDIENTE y uno EN_CURSO cambian de presentación»; `order-crud.int.test.ts` › «R9: editar sustituye la presentación» | unidad + integración |
| R10 | `update-order.test.ts` › «R10: ENTREGADO y CANCELADO rechazan con invalid_transition sin consultar el catálogo de presentaciones» | unidad |
| R11 | `tests/unit/pedidos/cancel-order.test.ts` y `delete-order.test.ts` › «R11: un pedido sin presentación se cancela / se da de baja» | unidad |
| R12 | `tests/unit/pedidos/authorization.test.ts` › «R12: sin pedidos.modificar, alta y edición rechazan antes de tocar el catálogo de presentaciones» (doble que falla si lo llaman) | unidad |
| R13 | `create-order.test.ts` › «R13: el coste y la cantidad no dependen de la presentación»; `tests/unit/pedidos/qc146-alcance.test.ts` (nuevo) › «R13: resolve-ingredients-cost y order-cost no nombran la presentación» | unidad |
| R14 | `order-crud.int.test.ts` › «R14: alta y edición con presentación no escriben movimientos ni cambian la existencia de los lotes» | integración |
| R15 | `qc146-alcance.test.ts` › «R15: ningún permiso nombra la presentación y el Operador conserva exactamente sus dos permisos» | unidad |
| R16 | `tests/unit/pedidos-ui/order-form.test.tsx` › «R16: el alta ofrece el campo Presentación obligatorio» | unidad (UI) |
| R17 | `order-form.test.tsx` › «R17: el selector de presentación no ofrece crear» | unidad (UI) |
| R18 | `order-form.test.tsx` › «R18: la edición precarga la presentación; sin presentación el campo arranca vacío y no guarda» | unidad (UI) |
| R19 | `order-form.test.tsx` › «R19: presentation_not_found se pinta junto al campo y conserva lo escrito» | unidad (UI) |
| R20 | `tests/unit/pedidos-ui/order-columns.test.tsx` › «R20: la columna Presentación pinta el nombre o Sin presentación»; `tests/unit/pedidos-ui/order-list-skeleton.test.tsx` (diez columnas) | unidad (UI) |
| R21 | `order-columns.test.tsx` › «R21: Presentación no ordena ni filtra»; `tests/unit/pedidos/list-orders.test.ts` › «R21: ordenar o filtrar por presentación se omite y se registra» | unidad |
| R22 | `list-orders.test.ts` › «R22: una sola llamada al catálogo de presentaciones por página, ninguna sin presentaciones» | unidad |
| R23 | `tests/unit/pedidos/order-service.test.ts` (ficha) › «R23: la ficha devuelve id y nombre de la presentación, o su ausencia» | unidad |
| R24 | `tests/unit/asignaciones/list-assigned-orders.test.ts` › «R24: cada fila lleva el nombre de la presentación o null, con una sola llamada»; `tests/unit/asignaciones-ui/assigned-orders-columns.test.tsx` › «R24: columna Presentación» | unidad |
| R25 | `tests/unit/asignaciones/get-assigned-order-execution.test.ts` › «R25: la vista lleva la presentación o null»; `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` › «R25: muestra la presentación o Sin presentación» | unidad |
| R26 | `list-assigned-orders.test.ts` › «R26: un actor con solo asignaciones.consultar recibe la presentación»; `order-execution-screen.test.tsx` › «R26: no hay ningún control de presentación» | unidad |
| R27 | `tests/unit/pedidos/order-catalog.test.ts` › «R27: el resumen publicado lleva presentationId»; `tests/integration/pedidos/order-repository.int.test.ts` › «R27: listAliveSummariesByIds devuelve la presentación» | unidad + integración |
| R28 | `tests/unit/inventario/presentation-catalog.test.ts` (nuevo) › «R28: findRefs compone el ámbito y con ids vacíos no consulta»; `tests/integration/inventario/company-scope-queries.int.test.ts` › «R28: el catálogo de presentaciones no devuelve las de otra empresa» | unidad + integración |
| R29 | `e2e/pedidos.spec.ts` › caso R48 de QC-35 ampliado: «… elige presentación y la ve en su fila (R29)» | E2E |
| R30 | `tests/guards/guard-dependencias-aprobadas.test.ts` (existente) y `qc146-alcance.test.ts` › «R30: package.json no gana dependencias» | guardia + unidad |

---

## 11. Archivos que toca la ficha (para la validación de conflictos)

**Nuevos:** `db/migrations/<ts>_orders_presentation/{migration.sql,down.sql}`,
`lib/modules/inventario/domain/presentation-catalog.ts`,
`lib/modules/inventario/adapters/driven/persistence/presentation-catalog-prisma.ts`,
`components/shared/order-presentation-label.tsx`,
`tests/unit/pedidos/schema/orders-presentation-migration.test.ts`,
`tests/unit/inventario/presentation-catalog.test.ts`, `tests/unit/pedidos/qc146-alcance.test.ts`.

**Modificados:** ver la columna «Archivos» de cada task en `tasks.md`. Los compartidos con otras
fichas en curso de la zona `fullstack`, según sus specs:

- con **QC-121**: `db/schema.prisma`, `lib/composition/index.ts`, `lib/modules/inventario/index.ts`.
- con **QC-147** (según su alcance: costo del pedido y pantalla del Operario):
  `db/schema.prisma`, `lib/composition/index.ts`,
  `lib/modules/asignaciones/domain/get-assigned-order-execution.ts`,
  `lib/modules/asignaciones/domain/assigned-order-execution-view.ts`,
  `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` y sus tests. Esta ficha
  **no** toca `order-cost.ts`, `resolve-ingredients-cost.ts`, `order-ingredients-table.tsx`,
  `order-execution-lines.tsx` ni `order-scale-banner.tsx`.

La intersección la decide el leader; lo de arriba es el inventario, no una valoración.
