# QC-156 — pedido-con-cliente · design.md

> Zona `fullstack` · Rama `feature/QC-156-pedido-con-cliente` · depende de QC-154 (cerrada).
> El **qué** está en `requirements.md` (R1–R40); aquí va el **cómo**. Cada decisión cita lo que copia
> del árbol, no lo inventa. Precedentes verificados en la rama: `RecipeCatalog`
> (`lib/modules/recetas/domain/recipe-catalog.ts`), `OrderCatalog`
> (`lib/modules/pedidos/domain/order-catalog.ts`), la edición acotada «Reparto y unidad» de QC-170
> (`updateOrderDistributionAction`, `ORDER_STATUS_ACCEPTS_DISTRIBUTION_EDIT` en
> `order-row-actions.tsx`) y el contrato-primero de QC-209 (`T0` publica interfaces y stubs para que
> las pistas backend y frontend trabajen en paralelo).

---

## 0. Resumen

| Pieza | Qué es | Dónde |
| --- | --- | --- |
| Columna | `orders.customer_id UUID NULL`, FK compuesta `(company_id, customer_id) → customers(company_id, id)` | migración `20261006160000_orders_customer` |
| Servicio de clientes | `CustomerCatalog`: id, nombres, apellidos, marca de baja. Solo lectura | `lib/modules/clientes/domain/customer-catalog.ts` + adaptador driven + reexport en `index.ts` |
| Casos de uso nuevos | `setOrderCustomer`, `searchOrderCustomers`, `getOrderCustomerFilterOption` | `lib/modules/pedidos/domain/` |
| Casos de uso que cambian | `createOrder`, `updateOrder` (validan el cliente); `getOrder`, `listOrders` (lo resuelven y filtran) | ídem |
| Server Actions nuevas | `setOrderCustomerAction`, `searchOrderCustomersAction`, `getOrderCustomerFilterOptionAction` | `lib/modules/pedidos/adapters/driving/order-actions.ts` |
| Pantalla | columna «Cliente», campo en el formulario, acción de fila «Cliente» con diálogo, filtro «Cliente» en la barra | `app/(private)/pedidos/components/` |
| Componente compartido | `AsyncAutocomplete` gana **una** prop opcional `defaultInputValue` | `components/shared/async-autocomplete.tsx` |

Ningún código de error nuevo (`customer_not_found` ya existe, decimotercera enmienda de QC-154). No
hay permisos nuevos ni dependencias nuevas.

---

## 1. Contrato publicado en T0 (lo que desbloquea las dos pistas)

Mismo esquema que QC-209 T0. T0 publica en código **real** los tipos, las firmas y los stubs. Después,
la pista B (backend) y la pista F (frontend) trabajan en paralelo **sin compartir ningún archivo**.
Todo lo que las dos tocarían lo toca T0 o TI.

### 1.1 `clientes` (aditivo, posición P5)

```ts
// lib/modules/clientes/domain/customer-catalog.ts
export type CustomerRef = {
  readonly id: string;
  readonly firstNames: string;
  readonly lastNames: string;
  readonly isDeleted: boolean;
};

export type CustomerRefSearch = {
  readonly search: string;          // '' = sin busqueda
  readonly includeDeleted: boolean; // true solo para el filtro (R27)
  readonly page: number;            // >= 1
  readonly pageSize?: number;       // defecto 10, tope 25: lo aplica el adaptador
};

export interface CustomerCatalog {
  /** Incluidos los dados de baja (isDeleted: true). Un id de otra empresa o inexistente no vuelve. */
  findRefsIncludingDeleted(ids: readonly string[], companyId: string): Promise<readonly CustomerRef[]>;
  /** null = no existe, dado de baja o de otra empresa. */
  findAliveRefById(id: string, companyId: string): Promise<CustomerRef | null>;
  /** Orden apellidos, nombres, id. Busqueda por palabra normalizada en nombres, apellidos y ciudad. */
  searchRefs(query: CustomerRefSearch, companyId: string): Promise<Page<CustomerRef>>;
}
```

- **`companyId: string` y no `CustomerScope`** en la interfaz pública: es la razón escrita en
  `RecipeCatalog` (líneas 36–39). Un tipo de ámbito interno no se publica para que otro módulo lo
  construya. El **adaptador** sí declara `scope: CustomerScope`, porque
  `tests/guards/guard-ambito-empresa-clientes.test.ts` lo exige a toda función de persistencia del
  módulo. Quien traduce `companyId` a `{ companyId }` es `lib/composition` (§ 6).
- **Sin `city`, `phone`, `email` ni `address`** (R19, R37). La ciudad se **busca** (R27, mismo
  criterio que el listado de clientes) pero no se **devuelve**. Si F1.4 elige la alternativa de P4,
  se añade aquí.
- **Ninguna comprobación de permiso**: `RecipeCatalog` tampoco la hace. Quien autoriza es el caso de
  uso de `pedidos` que lo llama (R6, R7, R8).
- `index.ts` reexporta `CustomerCatalog`, `CustomerRef` y `CustomerRefSearch`, todos solo como
  **tipos**. Así el cierre de imports del barrel no cambia.

### 1.2 `pedidos`: tipos

```ts
// lib/modules/pedidos/domain/order-customer.ts
export type OrderCustomer = { readonly id: string; readonly name: string; readonly isDeleted: boolean };
export type OrderCustomerSearchPurpose = 'assign' | 'filter';
export const ORDER_CUSTOMER_FILTER_FIELD = 'customerId';
/** UNICA definicion del nombre del cliente en pedidos (P4): «Nombres Apellidos». */
export function formatOrderCustomerName(ref: Pick<CustomerRef, 'firstNames' | 'lastNames'>): string;
export function toOrderCustomer(ref: CustomerRef): OrderCustomer;
/** Forma de uuid; un id sin forma no llega al catalogo (R11, precedente QC-154 P5). */
export function isCustomerIdShape(id: string): boolean;
```

Cambios en `order-view.ts`:

- `OrderRow` gana `customerId: string | null`.
- `NewOrder` y `OrderEdit` ganan `customerId: string | null`.
- `OrderView` (y `OrderSummary`, que es su alias) gana `customer: OrderCustomer | null`.

`OrderRow` no lleva el nombre, por el mismo motivo por el que no lleva el de la receta.

### 1.3 `pedidos`: firmas de los casos de uso nuevos

```ts
createSetOrderCustomer(deps: SetOrderCustomerDeps)
  : (id: string, input: unknown, actor: Actor | null | undefined) => Promise<void>
createSearchOrderCustomers(deps: SearchOrderCustomersDeps)
  : (input: unknown, purpose: OrderCustomerSearchPurpose, actor: Actor | null | undefined) => Promise<Page<OrderCustomer>>
createGetOrderCustomerFilterOption(deps: GetOrderCustomerFilterOptionDeps)
  : (id: string, actor: Actor | null | undefined) => Promise<OrderCustomer | null>
```

`CustomerNotFoundError` (`code = 'customer_not_found'`) entra en `domain/errors.ts`. En T0, los
cuerpos de las tres factorías lanzan «sin implementar» y la pista B los rellena. Así B no vuelve a
tocar el barrel.

### 1.4 Server Actions (contrato de entrada y salida)

```ts
export type OrderCustomerOptionsResult = { status: 'success'; data: Page<OrderCustomer> } | ErrorState;
export type OrderCustomerFilterOptionResult = { status: 'success'; data: OrderCustomer | null } | ErrorState;

/** Cambio de cliente (R14-R18). Argumentos tipados, sin FormData: el dialogo no es un <form> de
 *  campos multiples (mismo criterio que updateOrderDistributionAction). */
export async function setOrderCustomerAction(id: string, input: unknown): Promise<OrderMutationFormState>;
//   input = { customerId: string | null }

/** Opciones del autocomplete. `purpose` decide permiso y si entran los dados de baja (R27, R28). */
export async function searchOrderCustomersAction(
  query: unknown, purpose: OrderCustomerSearchPurpose,
): Promise<OrderCustomerOptionsResult>;
//   query = { search: string; page: number; pageSize?: number }

/** Resuelve el cliente que trae la URL del filtro (R29). null = descartar el filtro. */
export async function getOrderCustomerFilterOptionAction(id: string): Promise<OrderCustomerFilterOptionResult>;
```

En T0 las tres hacen dos cosas reales: llaman a `currentActor()` y traducen con `toErrorState`.
Devuelven datos fijos de `adapters/driving/order-customer-fixtures.ts`, y TI borra ese archivo. Con
eso la pista F prueba su pantalla contra respuestas reales en forma. Las tres entran en
`tests/unit/identity/session-once-per-request-actions.test.ts` **en T0**: llaman a
`currentActor()`, que resuelve las dos caras de la sesión, y la guardia se pondría roja si no
estuvieran listadas.

El alta y la edición **no cambian de firma**. El formulario envía un campo `customerId`, oculto, que
`buildCreateCandidate` lee con `readOptionalFormString` (TI).

---

## 2. Modelo de datos y migración (R1–R5)

### 2.1 Esquema

En `model Order` (`db/schema.prisma`):

```prisma
  /// Cliente del pedido, opcional. Sin `@relation`: `Customer` es de `clientes`, es drift. FK
  /// COMPUESTA `(company_id, customer_id)` a `customers_company_id_id_key`, escrita a mano.
  customerId          String?       @map("customer_id") @db.Uuid
  ...
  @@index([companyId, customerId], map: "orders_company_id_customer_id_idx")
```

El comentario `///` de cabecera del modelo (líneas 636–638) añade `customerId` a la lista de
escalares sin `@relation`. **Identificador en inglés** (QC-4). Ningún otro campo cambia (R5).

### 2.2 `db/migrations/20261006160000_orders_customer/`

Timestamp elegido por encima del último de `dev` (`20261005120000_recipe_packing_steps`) y de los de
las ramas paralelas (QC-209 `20261006120000`, QC-213 `20261006140000`), para que el orden de
aplicación no dependa de quién mergee primero.

`migration.sql`, escrita a mano como `20260924120000_customers`. Una migración generada vería las FK
como drift y propondría un reset.

```sql
-- 1. La columna, nullable: los pedidos existentes quedan sin cliente (R2). Sin DEFAULT ni UPDATE.
ALTER TABLE "orders" ADD COLUMN "customer_id" UUID;

-- 2. Indice del lado hijo, con la empresa delante: sirve al filtro (R23) y a la comprobacion de la FK.
CREATE INDEX "orders_company_id_customer_id_idx" ON "orders" ("company_id", "customer_id");

-- 3. FK COMPUESTA (R3). MATCH SIMPLE (defecto): con customer_id NULL no se comprueba. RESTRICT:
--    el cliente se da de baja logica, nunca se borra fisicamente con pedidos apuntandolo.
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_customer_id_fkey"
  FOREIGN KEY ("company_id", "customer_id") REFERENCES "customers"("company_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

`down.sql`, el orden inverso exacto (R4):

```sql
ALTER TABLE "orders" DROP CONSTRAINT "orders_company_id_customer_id_fkey";
DROP INDEX "orders_company_id_customer_id_idx";
ALTER TABLE "orders" DROP COLUMN "customer_id";
```

- **Sin RLS nueva**: `orders` ya la tiene activada y forzada.
- **Sin tocar `customers`**: la clave candidata `customers_company_id_id_key` ya existe (QC-153). La
  migración no crea nada fuera de `orders`.
- **Índice completo, no parcial.** Los de listado de `20260904160000_list_query_indexes` son
  parciales (`WHERE deleted_at IS NULL`). Este también tiene que servir a la comprobación de la FK
  si alguien borrara físicamente un cliente por consola, y un índice parcial no cubre las filas
  borradas. Coste: una entrada por pedido.

### 2.3 Guardia que se retira (decisión 7)

`tests/unit/pedidos/schema/pedidos-schema.test.ts:229`, el caso «Order no declara cliente…», se
**reescribe**, no se borra a secas. Pasa a afirmar R5:

- `Order` tiene exactamente un campo que casa con `/client|customer|.../`, que es `customerId`. Es un
  `String` opcional `@db.Uuid` con `@map("customer_id")` y sin `@relation`.
- Siguen prohibidos los modelos `Client`, `Recipient` y `Buyer`.
- Sigue prohibido `@@map("clients"|"recipients")`.

El comentario del caso deja escrito que QC-156 derogó la prohibición de QC-33 R3.
`pedidos-migration.test.ts:321` **no cambia**: mira solo el `CREATE TABLE "orders"` original, que
sigue sin cliente.

---

## 3. `clientes`: el adaptador del servicio (R36, R37)

`lib/modules/clientes/adapters/driven/persistence/customer-catalog-prisma.ts` es un archivo **nuevo**
y no amplía `customer-prisma.ts`. Así el CRUD de QC-154 no se toca (P5), y la lista de funciones con
consulta que `guard-ambito-empresa-clientes` cuenta en `customer-prisma.ts` sigue igual.

- `findCustomerRefsIncludingDeleted(ids, scope: CustomerScope)`: `findMany` con
  `where: { id: { in: ids.filter(isCustomerId) }, ...customerCompanyScope(scope) }`, **sin**
  `deletedAt`. Devuelve `isDeleted: deletedAt !== null`. Con la lista vacía devuelve `[]` sin
  consultar.
- `findAliveCustomerRefById(id, scope)`: comprueba `isCustomerId` y luego hace `findFirst` con
  `deletedAt: null`.
- `searchCustomerRefs(query, scope)`:
  - Usa la **misma** `searchCondition` que `listAliveCustomers`, por palabra con
    `normalizeCustomerText` sobre las tres columnas `*_normalized`. Se **extrae** a una función
    exportada del mismo archivo `customer-prisma.ts` o se importa desde él (driven → driven del
    mismo módulo, permitido por `docs/architecture.md > La regla de dependencias`, nota QC-9). La
    opción preferida es importar: no se duplica una línea.
  - Ordena por `lastNames`, `firstNames`, `id`.
  - Pagina con `toOffsetLimit` y `buildPage` de `lib/shared/pagination`, con el defecto 10 y el
    tope 25.
  - Con `includeDeleted: false` añade `deletedAt: null`.
- `select` mínimo: `id`, `firstNames`, `lastNames`, `deletedAt`. Ningún otro campo sale del adaptador
  (R19).

**Coste conocido:** los índices de trigramas de QC-154 son parciales sobre los clientes vivos. Una
búsqueda con `includeDeleted: true` (solo el filtro) recorre las filas dadas de baja sin índice. Con
el volumen de clientes de una empresa es aceptable, y se anota por si deja de serlo.

Los tests de `clientes` que cambian están en § 9.

---

## 4. `pedidos`: dominio

### 4.1 Alta y edición (R10–R13)

- `order-input.ts`: `createOrderSchema` y `updateOrderSchema` ganan
  `customerId: z.string().optional().transform(blank → null)`. **No** llevan `.uuid()`: un id sin
  forma de uuid tiene que acabar en `customer_not_found` (R11, precedente QC-154 P5) y no en
  `invalid_input`.
- `create-order.ts`: con `data.customerId !== null`, antes de abrir la transacción (mismo sitio que
  la comprobación de la receta, línea 111):
  1. si no tiene forma de uuid → `CustomerNotFoundError`, **sin** llamar al catálogo;
  2. `deps.customers.findAliveRefById(id, actor.companyId)`; si devuelve `null` →
     `CustomerNotFoundError`.

  `NewOrder.customerId` viaja hasta `transaction.orders.create`.
- `update-order.ts`: hace lo mismo **solo si** `data.customerId !== null && data.customerId !==
  row.customerId`. Es el criterio de la receta que no cambia (línea 99): se acepta aunque esté dada
  de baja (R12). `OrderEdit.customerId` viaja a `updateAlive`. El resto de la edición (coste,
  reservas, transición) **no cambia** (P6, R13).
- `CreateOrderDeps` y `UpdateOrderDeps` ganan `customers: Pick<CustomerCatalog, 'findAliveRefById'>`.

### 4.2 Cambio de cliente (R14–R18)

`domain/set-order-customer.ts`, en este orden:

1. `requirePermission(actor, 'pedidos.modificar')` en la primera línea (R6).
2. `z.object({ customerId: z.string().nullable().transform(blank → null) })`. Con `z.object` y no
   `strictObject`, las claves de más se descartan (R18, mismo criterio que QC-154 R18). Una entrada
   sin la clave `customerId` es `invalid_input`: el diálogo la envía siempre.
3. `deps.orders.findAliveById(id, scope)`. Si devuelve `null` → `OrderNotFoundError` (R18).
4. **Sin `assertTransition`** (R14). Este es el corazón de la decisión 5, y el test lo demuestra
   con los siete estados.
5. Si `customerId === row.customerId` → `return` sin escribir (R12, R17).
6. Si `customerId !== null`, aplica la comprobación de § 4.1 (R11).
7. `deps.unitOfWork.run(tx => tx.orders.setCustomerAlive(id, customerId, actor.id, now(), scope))`.
   Si devuelve `'not_found'` → `OrderNotFoundError`.

Va por `unitOfWork` y no por un puerto aparte porque `OrderRepository` es de solo lectura (su
comentario de cabecera dice que no declara escritura, «para no dejar dos caminos de escritura del
mismo pedido»). Es una sola sentencia dentro de la transacción.

**Sin `FOR UPDATE` ni segunda comprobación de estado**: no hay ninguna regla de estado que
proteger. Si un pedido se borra entre el paso 3 y el 7, el `UPDATE` condicional devuelve
`'not_found'`. Si el cliente se da de baja entre el paso 6 y el 7, el pedido queda con un cliente
dado de baja, que es exactamente el estado que la decisión 6 admite cuando la baja ocurre después.

**Dependencias:** `orders: OrderRepository`,
`customers: Pick<CustomerCatalog, 'findAliveRefById'>`, `unitOfWork: OrderUnitOfWork`,
`now?: () => Date`. **No** recibe catálogos de recetas, inventario ni unidades. Que no los tenga es
la prueba estructural de R15: no puede tocar coste ni reservas.

### 4.3 Búsqueda de opciones y opción de filtro (R27–R29)

`domain/search-order-customers.ts`:

- El permiso depende del propósito: `'assign'` pide `pedidos.modificar` y `'filter'` pide
  `pedidos.consultar` (R6, R7). Un `purpose` fuera de esos dos valores es `invalid_input`, y lo
  comprueba zod **después** del permiso. Con `purpose` desconocido se exige `pedidos.modificar`
  (falla cerrado).
- Esquema: `{ search: string ≤ 120 (default ''), page: int ≥ 1 (default 1), pageSize?: int ≥ 1 }`.
  `strictObject`, como `createListQuerySchema`.
- `deps.customers.searchRefs({ search, includeDeleted: purpose === 'filter', page, pageSize },
  actor.companyId)`. El resultado se mapea con `toOrderCustomer`.

`domain/get-order-customer-filter-option.ts`:

1. `requirePermission(actor, 'pedidos.consultar')`.
2. Un id sin forma de uuid devuelve `null` sin consultar.
3. `findRefsIncludingDeleted([id], companyId)`; devuelve su primer elemento mapeado o `null`.

Incluye los dados de baja por coherencia con R27.

### 4.4 Listado y ficha (R19–R26)

- `order-queryable.ts`: `filterable` gana `customerId: 'select'`. `sortable` **no cambia** (R26). El
  comentario explica por qué no es ordenable (P3).
- `list-orders.ts`:
  - Una segunda poda, junto a `pruneClosedSelects`: los valores del `select` `customerId` que no
    tengan forma de uuid se quitan y el campo se anota en `ignored` (R24). Con la lista vacía, el
    filtro desaparece.
  - Después de `listAlive`, los `customerId` no nulos de la página se recogen sin repetir. Con la
    lista vacía no se consulta. Si no, se hace **una** llamada a
    `deps.customers.findRefsIncludingDeleted` (R21).
  - `toOrderView` recibe un `Map<id, OrderCustomer>`. Un id que no vuelve del catálogo (borrado
    físico por consola, que la FK `RESTRICT` hace casi imposible) se pinta como `customer: null`.
    Así la fila sigue apareciendo, como hace `recipeName`.
- `get-order.ts`: `toOrderView` gana el parámetro de clientes. `getOrder` hace una llamada con el id
  único.
- La **búsqueda** sigue resolviendo a ids de receta (`findIdsMatchingName`) y nada más (R25). No se
  toca.
- `ListOrdersDeps` y `GetOrderDeps` ganan
  `customers: Pick<CustomerCatalog, 'findRefsIncludingDeleted'>`.

### 4.5 Lo que NO cambia (R22)

- `order-catalog.ts` (`OrderCatalog`, `AssignedOrderSummary`) y `order-catalog-prisma.ts`: el
  `select` del catálogo no gana `customerId`.
- `list-order-summaries.ts`, `order-packing.ts`, `transition-order.ts`, `cancel-order.ts`,
  `delete-order.ts`, `expire-stale-orders.ts`, `review-blocked-orders.ts`: ninguno lee ni escribe el
  cliente.

Un test estático (§ 9) lo vigila sobre los tipos públicos de `OrderCatalog`.

---

## 5. Puertos y adaptador driven de `pedidos`

- `ports/order-write-repository.ts`: método nuevo
  `setCustomerAlive(id, customerId: string | null, actorId: string, now: Date, scope: OrderScope):
  Promise<'ok' | 'not_found'>`. Lleva `scope` al final, como exige
  `guard-ambito-empresa-pedidos.test.ts`. Su comentario dice qué escribe y qué no.
- `ports/order-repository.ts`: **sin cambio de firma**. El filtro viaja dentro del `ListQuery` ya
  saneado.
- `adapters/driven/persistence/order-prisma.ts`:
  - el `select` del pedido gana `customerId`, y `toOrderRow` lo copia;
  - `create` y `updateAlive` escriben `customerId`;
  - `orderFilterWhere`, en el caso `'select'` con `field === 'customerId'`, devuelve
    `{ customerId: { in: values } }`;
  - `setCustomerAlive` hace `updateMany` con
    `where { id, deletedAt: null, ...companyScope(scope) }` y
    `data { customerId, updatedBy: actorId, updatedAt: now }`. Si `count === 0` devuelve
    `'not_found'`. **Ninguna otra columna** en `data` (R15).

---

## 6. Composición (`lib/composition/index.ts`)

Un bloque nuevo **al final del archivo**, como hizo QC-154, para no reordenar nada. Importa
`customer-catalog-prisma` (permitido: la composición puede importar driven de cualquier módulo) y
construye:

```ts
const customerCatalog: CustomerCatalog = {
  findRefsIncludingDeleted: (ids, companyId) => findCustomerRefsIncludingDeleted(ids, { companyId }),
  findAliveRefById: (id, companyId) => findAliveCustomerRefById(id, { companyId }),
  searchRefs: (query, companyId) => searchCustomerRefs(query, { companyId }),
};
```

Después, en el bloque de `pedidos`:

- `customers: customerCatalog` entra en las dependencias de `createOrder`, `updateOrder`,
  `getOrder` y `listOrders`;
- se añaden `setOrderCustomer`, `searchOrderCustomers` y `getOrderCustomerFilterOption` a la fachada
  `pedidos`.

Las dos piezas van en una sola tanda (B6), porque la fachada de `pedidos` vive más arriba en el
mismo archivo y conviene tocar el archivo una vez.

---

## 7. Server Actions (`order-actions.ts`)

- Las tres actions de § 1.4 siguen el patrón de las existentes: `currentActor()`, `try`, caso de
  uso, y `toErrorState(error)` en el `catch`. **Ninguna** llama a `requirePermission`: el test de
  `order-actions.test.ts:250` solo admite la excepción de `updateOrderDistributionAction`, y no se
  amplía.
- No hay `revalidatePath`: la pantalla llama a `router.refresh()`, como en todo `pedidos`
  (comentario de `order-sheet.tsx`).
- `buildCreateCandidate` lee `customerId` con `readOptionalFormString`. `buildUpdateCandidate`
  sigue siendo el mismo (P6).
- `tests/unit/pedidos/order-actions.test.ts:905` y `:921` (la lista de aridades y firmas de las
  actions exportadas) ganan las tres nuevas.

---

## 8. Pantalla `/pedidos`

Restricción de nombres heredada de QC-154 R38 y QC-155 R37: `tests/unit/clientes/scope.test.ts:507`
prohíbe en `app/` fuera de `(private)/clientes/` estas cuatro cosas:

- la palabra `customers` (plural, con `\b`);
- la ruta `/clientes`;
- `clientes.consultar` y `clientes.modificar`;
- `'Clientes'` entre comillas;

y cualquier **nombre de archivo** que contenga «cliente». Por eso todos los archivos nuevos se
llaman `order-customer-*`, ninguna variable se llama `customers`, y el texto visible es «Cliente» en
singular (R36).

| Archivo | Cambio |
| --- | --- |
| `components/shared/async-autocomplete.tsx` | prop opcional `defaultInputValue?: string`: valor inicial del campo. Sin ella el comportamiento es idéntico al de hoy. Es lo único que falta para precargar la edición (R31) y el filtro (R29). **No** se toca el canal `error` (la Opción A de QC-71, descartada). |
| `order-customer-label.ts` (nuevo) | `orderCustomerLabel(customer)`: el nombre, más « (eliminado)» si `isDeleted` (R20). La usan la columna, el selector, el filtro y el diálogo, y es la única definición. |
| `order-customer-picker.tsx` (nuevo, `'use client'`) | Envoltura de `AsyncAutocomplete<OrderCustomer>`. Props: `purpose`, `value: OrderCustomer \| null`, `onChange`, `name?` (input oculto con el **id**, no la etiqueta), `disabled`, `aria-*`. `fetchPage` llama a `searchOrderCustomersAction({ search, page, pageSize }, purpose)` y, en error, lanza. Es el mismo canal que `recipe-picker` (QC-71 lo dejó así a propósito). |
| `order-list-params.ts` | `CUSTOMER_PARAM = 'customer'` y `CUSTOMER_COLUMN_ID = ORDER_CUSTOMER_FILTER_FIELD`. Lee un uuid (regex de forma) o nada, y genera `?customer=<id>`. `parse(build(p))` sigue devolviendo `p`. |
| `order-columns.tsx` | Columna `{ id: 'customer', label: 'Cliente', align: 'start' }`, sin `sortable` ni `filter` (R26, R30). La celda es `orderCustomerLabel` o `<MissingValue/>`. Va detrás de «Receta». |
| `order-form.tsx` | Campo «Cliente» con `OrderCustomerPicker purpose="assign" name="customerId"`, precargado con `order?.customer` (R31). Va detrás del selector de receta. |
| `order-customer-dialog.tsx` (nuevo, `'use client'`) | Diálogo controlado con el selector (`purpose="assign"`), un botón «Quitar cliente» y otro «Guardar». Llama a `setOrderCustomerAction(order.id, { customerId })`. Con éxito: cierra, `toast.success('Cliente actualizado.')` y `router.refresh()`. Con error: mensaje del catálogo y sigue abierto (R33). Se monta solo mientras está abierto, como los otros diálogos de la fila. |
| `order-row-actions.tsx` | Item `{ key: 'customer', label: 'Cliente', icon: UserIcon, testId: 'order-action-customer' }`, **sin `disabled`** en ningún estado (R32). Solo aparece si `canEditCustomer`. Prop nueva: `onCustomer`. |
| `order-sheet.tsx` (`OrderRowSheetActions`) | `customerOpen` y el diálogo montado condicionalmente. Pasa `canEditCustomer`. |
| `order-customer-filter.tsx` (nuevo, `'use client'`) | `OrderCustomerPicker purpose="filter"` con el valor inicial que resolvió el servidor. Al elegir: `router.push(orderListHref(withFilter({ ...params, page: 1 }, CUSTOMER_COLUMN_ID, { kind: 'select', values: [id] })))`. Al limpiar quita la clave (R34). `withFilter` ya conserva los filtros que no son de columna (`data-table-params.ts:72`). |
| `order-table.tsx` | `toolbarActions={<OrderCustomerFilter … />}`, la ranura que hoy usa solo `customer-table.tsx`. Props nuevas: `customerFilter: OrderCustomer \| null` y `canEditCustomer`. |
| `order-list-section.tsx` | Si `params.filters.customerId` existe, llama a `getOrderCustomerFilterOptionAction(id)` **en paralelo** con `listOrdersAction`. Con `null`, quita el filtro de los parámetros **antes** de listar (R29). `canEditCustomer` sale del mismo `assertPermission(user, 'pedidos.modificar')` que ya calcula `canEditDistribution` (línea 111): no hay una segunda lectura de permisos. |
| `components/index.ts` | Reexporta los cuatro componentes y el formateador nuevos. |

El orden del menú es Editar, Cancelar, Eliminar, Responsables, **Cliente** y, cuando aplica,
Reparto y unidad. «Cliente» va detrás de «Responsables» porque es otra acción viva en estado final.

Multiplataforma (R35): `RowActionsMenu` ya da el objetivo táctil del disparador. El diálogo y el
filtro usan `Button` y `AsyncAutocomplete` con `min-h-11`, igual que `TOUCH_TARGET` en
`order-sheet.tsx`. No hay nada que dependa de `:hover`.

---

## 9. Guardias y tests existentes que cambian

| Archivo | Cambio | Por qué |
| --- | --- | --- |
| `tests/unit/pedidos/schema/pedidos-schema.test.ts:229` | Se reescribe a R5 | decisión 7 |
| `tests/unit/clientes/scope.test.ts:553` (R40 de QC-154) | La mitad de `clientes` **sigue igual**. En la mitad de `pedidos`, `importaModulo(fuente, 'clientes')` pasa a `importaModuloEnProfundidad` (`@/lib/modules/clientes/` seguido de algo). El import por barrel queda permitido y el profundo prohibido. Se mantiene `nombraModeloOTabla(fuente, 'customer', 'customers')`. Cada cambio lleva su caso de sensibilidad: el barrel no dispara y la ruta profunda sí. | R36, decisión 7 |
| `tests/unit/clientes/scope.test.ts:114` (`ARCHIVOS_ESPERADOS`) | `+ domain/customer-catalog.ts`, `+ adapters/driven/persistence/customer-catalog-prisma.ts` | R37 |
| `tests/guards/guard-ambito-empresa-clientes.test.ts` | Si su lista de adaptadores es cerrada, `+ customer-catalog-prisma.ts`, con sus tres funciones que declaran `scope: CustomerScope` | R36 |
| `tests/unit/pedidos/order-view.test.ts:119` | La lista exacta de `ORDER_QUERYABLE.filterable` gana `customerId` (`'select'`). `sortable` no cambia. | R23, R26 |
| `tests/unit/pedidos/order-actions.test.ts:905`, `:921` | Las tres actions nuevas | § 7 |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | Las tres actions nuevas | R9 |
| `tests/integration/aislamiento.json` | Los archivos de integración nuevos (§ 10) | censo QC-77 |
| Tests de `pedidos` y `pedidos-ui` que construyen `OrderRow` u `OrderSummary` a mano | `customerId: null` y `customer: null` (mecánico; lo marca `typecheck`) | § 1.2 |

Ninguna guardia se **relaja** salvo las dos que la decisión 7 manda retirar: la de esquema y la
mitad «pedidos no importa clientes» de R40. Las dos se reescriben más estrictas en lo que siguen
prohibiendo.

---

## 10. Verificación: dónde vive el test de cada requisito

| R | Test | Tipo |
| --- | --- | --- |
| R1, R5 | `tests/unit/pedidos/schema/pedidos-schema.test.ts` | unit (esquema) |
| R2, R3, R4 | `tests/unit/pedidos/schema/orders-customer-migration.test.ts` (forma del SQL UP/DOWN) + `tests/integration/pedidos/orders-customer-constraints.int.test.ts` (FK compuesta: otra empresa → `23503`; NULL válido; los existentes NULL tras migrar; DOWN deja el esquema previo) | unit + int |
| R6, R7, R8 | `tests/unit/pedidos/order-customer-authorization.test.ts`: matriz operación × {sin permiso, solo `pedidos.consultar`, solo `pedidos.modificar`, ambos sin `clientes.*`}, con dobles que fallan si se les llama | unit |
| R9 | `tests/unit/pedidos/order-actions-customer.test.ts` + `session-once-per-request-actions.test.ts` | unit |
| R10–R13 | `tests/unit/pedidos/order-customer-write.test.ts` (alta y edición contra dobles; cuenta llamadas al catálogo) | unit |
| R14–R18 | `tests/unit/pedidos/set-order-customer.test.ts` (siete estados; dobles de recetas, inventario y reservas **ausentes**; el `unitOfWork` solo ve `setCustomerAlive`) + `tests/integration/pedidos/order-customer.int.test.ts` (antes y después de la fila completa: solo cambian `customer_id`, `updated_by` y `updated_at`; reservas e `inventory_movements` intactos) | unit + int |
| R19, R20, R21 | `tests/unit/pedidos/list-orders-customer.test.ts` (cuenta una llamada por página, ids sin repetir, cero sin clientes) + `get-order.test.ts` | unit |
| R22 | `tests/unit/pedidos/order-customer-boundaries.test.ts`: los tipos de `OrderCatalog` no tienen clave `customer*`, y el `select` de `order-catalog-prisma.ts` tampoco | unit estático |
| R23, R24 | `list-orders-customer.test.ts` (poda y log) + `order-customer.int.test.ts` (filtro en base, total, combinación con estado y búsqueda, otra empresa → 0) | unit + int |
| R25 | `list-orders-customer.test.ts`: con un término que solo casa con el cliente, el catálogo de recetas recibe el término y el de clientes no | unit |
| R26 | caso nuevo en `tests/unit/pedidos/list-orders-customer.test.ts`: `ORDER_QUERYABLE.sortable` no contiene `customer*`, y pedir `sort: customerId` se omite y se anota. Además, `order-view.test.ts:119` sigue fijando `sortable` y `filterable` exactos (§ 9). | unit |
| R27, R28, R29 | `tests/unit/pedidos/search-order-customers.test.ts` + `tests/integration/clientes/customer-catalog.int.test.ts` (empresa, bajas, orden, búsqueda sin acentos, 10/25) + `tests/unit/pedidos-ui/order-customer-filter.test.tsx` | unit + int |
| R30 | `tests/unit/pedidos-ui/order-columns.test.tsx` | unit (RTL) |
| R31 | `tests/unit/pedidos-ui/order-form-customer.test.tsx` + `tests/unit/async-autocomplete.test.tsx` (prop nueva) | unit (RTL) |
| R32, R33 | `tests/unit/pedidos-ui/order-customer-dialog.test.tsx` + `order-row-actions.test.tsx` (siete estados × `canEditCustomer`) | unit (RTL) |
| R34 | `tests/unit/pedidos-ui/order-list-params.test.ts` (ida y vuelta) + `order-customer-filter.test.tsx` | unit |
| R35 | `order-customer-dialog.test.tsx` y `order-customer-filter.test.tsx` (clases de objetivo táctil) + `pedidos-viewport.test.tsx` | unit |
| R36 | `tests/unit/clientes/scope.test.ts` (R40 y R38 reescritos) + `guard-arquitectura-modulos` | unit + guardia |
| R37 | `tests/unit/clientes/customer-catalog.test.ts` (forma de `CustomerRef` con `expectTypeOf`; el `select` del adaptador) + los tests de `clientes` de QC-154 y QC-155 sin cambios y en verde | unit |
| R38 | `guard-catalogo-de-errores` + `tests/unit/errores/catalogo.test.ts` (sin cambios: el recuento sigue igual) + `permissions.test.ts` sin cambios | guardia |
| R39 | `guard-dependencias-aprobadas` (`package.json` sin cambios) | guardia |
| R40 | `e2e/pedido-con-cliente.spec.ts`. Para (d) crea un rol efímero con **solo** `pedidos.consultar`, con el patrón de `e2e/inventario.spec.ts:478` (`prisma.role.create` con prefijo del worker). El seed no tiene ningún rol así: el Operador no tiene `pedidos.consultar`. | E2E |

Base de datos de integración propia: `QuimiCloude_QC156`. Los tests corren con `DATABASE_URL` y
`DIRECT_URL` sobrescritos en el entorno del comando (lección de QC-147, igual que en QC-154).

---

## 11. Alternativas descartadas

### A1. Puerto en `pedidos` implementado en la composición, sin tocar `clientes` — descartada

`pedidos` declararía `ports/customer-directory.ts` y `lib/composition` lo cumpliría componiendo
funciones driven que `clientes` ya tiene (`findAliveCustomerById`, `listAliveCustomers`). Era la
única forma literal de «cero cambios en `clientes`». Se descarta por tres motivos:

- **Falta una lectura.** No existe ninguna función de `clientes` que devuelva clientes **dados de
  baja**, y la decisión 6 la necesita para pintar «(eliminado)». Habría que añadirla al driven de
  `clientes`, y eso es cambiar `clientes` igual.
- **Expondría datos personales de más.** `listAliveCustomers` devuelve `CustomerView` entera, con
  teléfono, correo y dirección. La composición tendría que recortarla, y el día que alguien olvidara
  el recorte esos datos llegarían a la fila del pedido (R19).
- **Contradice la decisión 7**, que dice «`pedidos` importa de `clientes` por su `index.ts`», y el
  patrón de la arquitectura: «se comparten servicios vía interfaz» que publica el **dueño** del dato
  (`RecipeCatalog`, `OrderCatalog`, `PeopleDirectory`).

### A2. Reutilizar `listCustomers` de QC-154 para el selector — descartada

Exige `clientes.consultar`, y la decisión 4 lo excluye expresamente. Aflojar ese permiso sería
cambiar `clientes`, justo lo que el Alcance prohíbe.

### A3. Cambiar el cliente por `updateOrder` en todos los estados — descartada

`updateOrder` pasa por `assertTransition(row.status, row.status)`, recalcula el coste y sincroniza
las reservas. Abrirlo a `ENTREGADO` o `CANCELADO` obligaría a saltarse esas tres cosas con una rama
por campo, y la decisión 5 dice que el cliente no toca ninguna. El precedente de QC-170 resolvió lo
mismo para «Reparto y unidad» con un caso de uso y una action **dedicados**, y aquí se copia.

### A4. Copiar el nombre del cliente en el pedido (instantánea) — descartada

Resolvería «(eliminado)» sin leer `clientes`, pero sería una segunda fuente del nombre que se
desincroniza cuando el cliente se edita. La decisión 6 dice «conserva la **referencia**».

### A5. Filtro «Cliente» como columna filtrable de `DataTable` — descartada

`DataTable` solo sabe pintar filtros `select` con opciones fijas, `dateRange`, `text` y
`numberRange`. Un autocompletado asíncrono no es ninguno de los cuatro, y añadirlo cambiaría
`components/shared/data-table` para toda la aplicación. La ranura `toolbarActions` ya existe para
esto, y `withFilter` conserva los filtros que no son de columna.

### A6. Una sola action de búsqueda sin `purpose`, que siempre incluya los dados de baja — descartada

La decisión 6 dice que el selector del formulario **no** ofrece eliminados. Además, los permisos
difieren: el selector pide `modificar` y el filtro `consultar`. Dos actions casi idénticas serían
duplicación; un parámetro `purpose` cerrado expresa las dos diferencias en un solo sitio.

---

## 12. Dependencias de terceros (R39)

Ninguna. Todo lo necesario está en el repositorio: Prisma, zod, el autocompletado compartido,
`RowActionsMenu`, `Dialog` de shadcn y `sonner`. Los cuatro checks de
`docs/architecture.md > Dependencias de terceros` no aplican.

---

## 13. Archivos y solapes con las fichas en curso de la zona `fullstack`

La lista completa por task está en `tasks.md > Archivos`. Solapes verificados contra los `tasks.md`
de las ramas `feature/QC-209-*` y `feature/QC-213-*`:

| Archivo | QC-209 | QC-213 | Riesgo |
| --- | --- | --- | --- |
| `db/schema.prisma` | modelo `InventoryImport` | `InventoryMovement` | Bloques distintos; conflicto textual improbable. El que mergee segundo rebasa. |
| `tests/integration/aislamiento.json` | entradas nuevas | entradas nuevas | Conflicto casi seguro en la lista (mismo array). Se resuelve a mano: unión de entradas. |
| `lib/composition/index.ts` | `inventario.previewInventoryImport` y siguientes | lo verifica sin cambios | QC-156 añade al **final** y en el bloque de `pedidos`. QC-209 toca el de `inventario`. Bloques distintos. |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | sus actions (TI) | — | Mismo array `ACCIONES`. Conflicto probable; se resuelve con la unión. |
| `db/migrations/` | `20261006120000_*` | `20261006140000_*` | Ninguno: `20261006160000` va después de las dos. |

Ninguna de las dos toca `lib/modules/pedidos/`, `lib/modules/clientes/`, `app/(private)/pedidos/` ni
`components/shared/async-autocomplete.tsx`.
