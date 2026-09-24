# QC-154 — crud-de-clientes · design.md

> Zona `backend` · Complejidad `medium` · depends_on `QC-153` · Rama `feature/QC-154-crud-de-clientes`
>
> El **qué** está en `requirements.md` (R1–R40). Aquí va el **cómo**: la forma del módulo `clientes`,
> los cinco casos de uso, el puerto y su adaptador Prisma, la Server Action, la enmienda al catálogo de
> errores y **qué guardias y tests existentes hay que ampliar** (y uno que hay que relajar a propósito,
> el que QC-153 dejó escrito para esta ficha).
>
> **Precedente literal: el CRUD de proveedores** (`specs/QC-43-crud-de-proveedores/`, con el
> aislamiento por empresa de QC-59 y la autorización por permiso de QC-74), tal como vive **hoy** en
> `lib/modules/proveedores/`. Este diseño **copia sus patrones y no inventa** donde ya hay decisión;
> cada vez que se aparta, lo dice y dice por qué.
>
> **El modelo ya existe y está mergeado.** QC-153 está `done`: `Customer` en `db/schema.prisma`
> (`@module clientes`, FK escalares sin `@relation`, clave candidata `customers_company_id_id_key`,
> RLS activada y forzada), la migración `20260924120000_customers` y el armazón del módulo
> (`index.ts` que reexporta el tipo `Customer`, `domain/customer.ts`, `ports/.gitkeep`,
> `adapters/.gitkeep`). **Esta ficha no toca la base** (R37): lo consume y llena el armazón.

---

## 1. Qué construye esta feature, y qué archivos toca

| Archivo | Qué se hace |
| --- | --- |
| `lib/modules/clientes/domain/*` | Actor y autorización, ámbito de empresa, errores, página, contrato de listados (copia idéntica), lista blanca, esquemas `zod`, tipos de salida y los **cinco casos de uso**. `customer.ts` **ya existe (QC-153) y no se toca**. |
| `lib/modules/clientes/ports/*` | `CustomerRepository` y `ListQueryLog`. Se **borra** `ports/.gitkeep`. |
| `lib/modules/clientes/adapters/driven/persistence/*` | `customer-prisma.ts`, `company-scope.ts`, `list-query-sql.ts`. Único sitio del módulo que toca `@prisma/client`. |
| `lib/modules/clientes/adapters/driving/customer-actions.ts` | **Un único archivo** de Server Actions (§ 9). Se **borra** `adapters/.gitkeep`. |
| `lib/modules/clientes/index.ts` | Conserva `Customer` y añade tipos, esquemas, errores, lista blanca y las cinco factories — **solo** de `./domain`. |
| `lib/composition/index.ts` | Gana la fachada `clientes` en un **bloque nuevo al final** (§ 10). |
| `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts` | **Duodécima enmienda**: `customer_not_found` (§ 7). |
| `tests/…` | Nuevos y **ampliados**; ver § 11 y § 12. |

**No se toca** `db/` (R37), `app/`, `components/`, `hooks/`, `e2e/`, `middleware.ts` (R38),
`lib/modules/pedidos/**` (R40), `lib/modules/identity/**` (los permisos ya los sembró QC-153) ni
`lib/shared/pagination.ts` (se consume, R36).

---

## 2. Estructura del módulo

```
lib/modules/clientes/
  index.ts                                    # CONTRATO: solo reexporta de ./domain
  domain/
    customer.ts                               # YA EXISTE (QC-153). NO SE TOCA.
    actor.ts                                  # Actor, requirePermission (delegado en identity)
    customer-scope.ts                         # CustomerScope = { companyId }
    errors.ts                                 # ClientesError y sus tres clases (§ 7)
    page.ts                                   # Page<T>
    list-query.ts                             # COPIA IDENTICA del contrato de listados (§ 6.1)
    customer-queryable.ts                     # CUSTOMER_QUERYABLE (R28)
    customer-input.ts                         # createCustomerSchema, updateCustomerSchema, largos
    customer-view.ts                          # CustomerView, NewCustomer
    customer-id.ts                            # isCustomerId (§ 5.3)
    create-customer.ts  update-customer.ts  delete-customer.ts
    get-customer.ts     list-customers.ts
  ports/
    customer-repository.ts
    list-query-log.ts                         # COPIA de la forma del puerto (como los otros seis)
  adapters/
    driven/persistence/customer-prisma.ts
    driven/persistence/company-scope.ts
    driven/persistence/list-query-sql.ts
    driving/customer-actions.ts
```

Cada caso de uso es una **factory** `createXxx(deps)` que devuelve la función, igual que en
`proveedores`: es lo que permite testearlo con dobles del puerto sin base.

**Por qué nombres de archivo en inglés y carpeta en español.** La carpeta del módulo es `clientes`
porque así la creó QC-153 y así se llaman los permisos (`clientes.*`); los identificadores de código
van en inglés (decisión 4), igual que `proveedores/supplier-*.ts`.

---

## 3. Autorización y actor (R1–R8)

### 3.1 `requirePermission`, primera línea de los cinco

Copia de `lib/modules/proveedores/domain/actor.ts`, sin cambiar nada más que el tipo de error:

```ts
// domain/actor.ts
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';   // barrel
import { UnauthorizedError } from './errors';

export type Actor = {
  readonly id: string;
  readonly companyId: string;
  readonly permissions: readonly string[];
};

export function requirePermission(
  actor: Actor | null | undefined,
  permission: PermissionCode,
): asserts actor is Actor {
  assertPermission(actor, permission, () => new UnauthorizedError());
}
```

| Caso de uso | Permiso exigido |
| --- | --- |
| `createCustomer`, `updateCustomer`, `deleteCustomer` | `clientes.modificar` |
| `getCustomer`, `listCustomers` | `clientes.consultar` |

- **Antes de `zod` y antes de tocar el puerto** (R2, R3, R5). El test que cierra R2/R3 usa dobles
  que **registran** la llamada y afirma `not.toHaveBeenCalled()`: un doble permisivo dejaría pasar
  una autorización puesta después de la consulta.
- **Falla cerrado y sin implicaciones** (R4): la regla es la de `identity/assertPermission`
  —pertenencia exacta— y no se reimplementa. Por eso el test de R4 prueba los casos cruzados
  (`modificar` sin `consultar` intentando leer, y al revés).
- **Sin nombre de rol** (R6): `Actor` no tiene `roleName`, y el módulo entra en el barrido de
  `guard-autorizacion-por-permiso` (§ 12).
- **R8, «solo del Administrador», se prueba con el dato real**: el test construye tres actores con
  `SEED_ROLE_PERMISSIONS` del barrel de `identity` —Administrador, Operador, Empacador— y recorre las
  cinco operaciones. Si mañana alguien siembra `clientes.consultar` al Operador, este test se pone
  rojo; ninguna otra pieza lo haría desde esta ficha. (Los tests pueden importar el seed; el código
  de producción de `clientes` no nombra ningún rol.)
- La RLS forzada de QC-153 **no autoriza nada**: Prisma se conecta como dueño. Defensa en profundidad.

### 3.2 De dónde sale el actor (R7)

La Server Action lo construye con `identity.getSessionUser()` e `identity.getSessionContext()`
leídos en **un solo** `runInRequestScope(() => Promise.all([...]))`, exactamente como
`supplier-actions.ts > currentActor()`. Si falta cualquiera de las dos caras, el actor es `null` y el
caso de uso rechaza (R4). La empresa **jamás** sale de lo que envía quien llama (R9).

`tests/unit/identity/session-once-per-request-actions.test.ts` **lee el disco**: en cuanto exista
`customer-actions.ts` con las dos caras, exige su fila en `ACCIONES` y que abra ámbito de petición.
Esta ficha **añade la fila** (`listCustomersAction({ page: 1 })`); no es opcional, el test se pone
rojo solo.

---

## 4. Aislamiento por empresa (R9–R12)

Copia del patrón de QC-59 en `proveedores`:

- **`CustomerScope = { companyId }`** lo construye cada caso de uso a partir de `actor.companyId`,
  **después** de `requirePermission`. El puerto lo exige como **último parámetro obligatorio** de
  sus cinco métodos: una llamada que lo omita no compila.
- **Un solo punto de definición** en el adaptador: `adapters/driven/persistence/company-scope.ts`
  con `customerCompanyScope(scope)` para los `where` y `companyScopeColumns(scope)` para el `data`
  del `create`. Se compone **al mismo nivel** que `deletedAt: null`, nunca dentro de la búsqueda ni
  de los filtros (R11).
- **Toda escritura sobre una fila existente lleva el ámbito en el `where`** (`updateMany` con
  `{ id, deletedAt: null, companyId }`), no en un `if` posterior: leer primero y decidir después ya
  es haber leído lo ajeno (R10). Un id de otra empresa da `count = 0` → `'not_found'` →
  `CustomerNotFoundError`, indistinguible de uno inexistente.
- **El `count` del listado usa literalmente el mismo objeto `where` que el `findMany`** (R11, R31).
- **R12 lo vigila una guardia nueva**, `tests/guards/guard-ambito-empresa-clientes.test.ts`,
  **calcada** de `guard-ambito-empresa-proveedores.test.ts`: por cada función de persistencia del
  módulo comprueba que **declara** `scope: CustomerScope` y que ese valor **llega** a una envoltura
  de `./company-scope`. Hace falta porque una **implementación** de menor aridad sí compila al
  cablearse en `lib/composition` (el motivo está escrito en la cabecera de la guardia de
  proveedores). Sin lista de excepciones.

---

## 5. Casos de uso

### 5.1 Alta y edición (R13–R21)

```ts
createCustomer(input: unknown, actor): Promise<{ id: string }>
updateCustomer(id: string, input: unknown, actor): Promise<void>
```

1. `requirePermission(actor, 'clientes.modificar')`.
2. `scope = { companyId: actor.companyId }`.
3. `createCustomerSchema.safeParse(input)` → si falla, `ValidationError` (`invalid_input`).
4. Puerto: `create(data, actor.id, now(), scope)` / `updateAlive(id, data, actor.id, now(), scope)`.
5. Edición: `'not_found'` → `CustomerNotFoundError`.

- **Sin resultado `'duplicate'`** en el puerto (R19): no hay índice único que lo produzca y la
  decisión 2 dice que no debe haberlo. Que el tipo no lo pueda expresar es lo que impide que alguien
  añada «por si acaso» una comprobación de duplicado.
- **Reemplazo completo** (R20): `updateCustomerSchema = createCustomerSchema`, como en proveedores.
- `now` es dependencia **inyectable** con `() => new Date()` por defecto (mismo patrón).

### 5.2 Baja (R21, R24)

`deleteCustomer(id, actor)` → `softDeleteAlive(id, actor.id, now(), scope)`; `false` →
`CustomerNotFoundError`. El adaptador hace **un solo** `updateMany` con
`{ deletedAt: now, updatedAt: now, updatedBy: actorId }`. **Sin transacción**: a diferencia del
proveedor, el cliente no arrastra ninguna tabla hija.

### 5.3 Ficha (R22, R23) y el identificador sin forma (P5)

`getCustomer(id, actor)` → `findAliveById(id, scope)`; `null` → `CustomerNotFoundError`.

**Se aparta de proveedores en un punto, y lo dice:** `get`, `update` y `delete` comprueban con
`isCustomerId(id)` (`z.string().uuid()` en `domain/customer-id.ts`) **después** del permiso y
**antes** del puerto; si no es un uuid, lanzan `CustomerNotFoundError` sin llamar al repositorio.
Proveedores no lo hace y deja que la columna `uuid` rechace el valor en la base, que llega a la
pantalla como `unexpected` —un error del sistema— para algo que no lo es. Es la posición por defecto
de **P5**; si el humano prefiere `invalid_input`, cambia la clase lanzada y un caso de test.

### 5.4 Listado (R26–R31)

Copia literal de `list-suppliers.ts`, en el mismo orden (el orden es el requisito):

1. `requirePermission(actor, 'clientes.consultar')`.
2. `createListQuerySchema().safeParse(input)` → `ValidationError` si falla (R26: página no entera o
   < 1).
3. `sanitizeListQuery(parsed, CUSTOMER_QUERYABLE)` (R27, R28).
4. `deps.log.ignoredFields('customers', ignored)` — solo nombres (R27).
5. `deps.customers.listAlive(query, scope)`.

---

## 6. Contratos de entrada y salida

### 6.1 El contrato de listados: una copia más, y la guardia la vigila

`domain/list-query.ts` se **copia carácter a carácter** de `lib/modules/proveedores/domain/list-query.ts`,
cambiando **solo** el nombre del módulo en las dos líneas que `textoComparable` neutraliza (la ruta de
la primera línea y «modulo `clientes`» de la cabecera). **No se corrige** el texto que dice «cinco
módulos» aunque ya sean siete: tocarlo obliga a tocar las seis copias a la vez, y eso es otra ficha.

`tests/guards/guard-contrato-listados.test.ts` **se amplía**: `clientes` entra como **séptimo** módulo
de `MODULOS` (import y fila), con la misma batería. Es ampliar, no relajar: sin esa fila, la copia de
`clientes` podría divergir sin que nada se pusiera rojo.

`ports/list-query-log.ts` se copia con la misma forma; en `lib/composition` se cablea con la **única**
implementación existente (`logIgnoredListQueryFields`).

### 6.2 Lista blanca y búsqueda (R28, R29, R30 — posiciones P2 y P3)

```ts
// domain/customer-queryable.ts
export const CUSTOMER_QUERYABLE: ListQueryable = {
  sortable: ['firstNames', 'lastNames', 'city', 'createdAt', 'updatedAt'],
  filterable: { city: 'text', createdAt: 'dateRange' },
  searchable: true,
};
```

**Búsqueda — campos: nombres, apellidos y ciudad.** Teléfono, correo y dirección **no** entran: son
opcionales, el alcance habla de buscar clientes, y en QC-155 la persona buscará por cómo se llama o de
dónde es. Añadir uno es una línea en el adaptador y un caso de test.

**Búsqueda — semántica.** El término se parte por espacios en palabras; **cada** palabra debe
aparecer (`contains`, `mode: 'insensitive'`) en **alguna** de las tres columnas:

```ts
{ AND: words.map((w) => ({ OR: [
    { firstNames: { contains: w, mode: 'insensitive' } },
    { lastNames:  { contains: w, mode: 'insensitive' } },
    { city:       { contains: w, mode: 'insensitive' } },
] })) }
```

Así «juan pérez» encuentra a *Juan* / *Pérez* aunque las dos palabras vivan en columnas distintas —con
el término entero contra cada columna no lo encontraría (alternativa A2)—. El `AND` se compone **al
lado** del ámbito y de `deletedAt: null`, no los envuelve.

**Acentos (P2):** `mode: 'insensitive'` es `ILIKE`: ignora mayúsculas, **no** acentos. Proveedores
evita eso con una columna normalizada; `customers` no la tiene y añadirla (o `unaccent`) es una
migración, que R37 excluye. Es la posición por defecto hasta que el humano diga otra cosa.

**Comodines (R30):** Prisma escapa `%` y `_` en `contains`; como no es algo que este diseño haya
verificado por su cuenta, **lo afirma un caso de integración** (buscar `%` no devuelve a todos). Si
fallara, el adaptador escapa el término antes de pasarlo.

**Coste asumido:** `ILIKE '%x%'` sobre tres columnas sin índice es un barrido de los clientes **de una
empresa** (el ámbito va primero y `customers_company_id_id_key` empieza por `company_id`). Para los
volúmenes de una empresa química no es un problema; si lo fuera, el índice de trigramas es la misma
migración que resolvería P2.

**Orden por defecto (R29, P3):** `lastNames ASC, firstNames ASC, id ASC`. Cualquier orden pedido lleva
`id ASC` de desempate (constante `TIE_BREAKER`, como en proveedores). Las cinco columnas ordenables son
`NOT NULL`: no hace falta `nulls: 'last'`.

**Filtros:** `city` → `textCondition` (`contains` insensible); `createdAt` → `dateRangeCondition`
(UTC, extremos inclusivos, decisión del 2026-09-04 escrita en la cabecera de
`proveedores/.../list-query-sql.ts`). `list-query-sql.ts` de `clientes` copia **solo esas dos
funciones** con sus tipos: copiar el archivo entero dejaría código muerto (`numberRange`, `select`,
`normalizedSearchCondition`) en un módulo que no lo usa.

### 6.3 Alta y edición (R14–R18, R20)

```ts
// domain/customer-input.ts
export const CUSTOMER_FIRST_NAMES_MAX_LENGTH = 80;
export const CUSTOMER_LAST_NAMES_MAX_LENGTH  = 80;
export const CUSTOMER_CITY_MAX_LENGTH        = 80;
export const CUSTOMER_PHONE_MAX_LENGTH       = 40;
export const CUSTOMER_EMAIL_MAX_LENGTH       = 160;
export const CUSTOMER_ADDRESS_MAX_LENGTH     = 200;

createCustomerSchema = z.object({
  firstNames: z.string().trim().min(1).max(80),
  lastNames:  z.string().trim().min(1).max(80),
  city:       z.string().trim().min(1).max(80),
  phone:      z.string().trim().max(40).nullish(),
  email:      z.string().trim().max(160).nullish(),
  address:    z.string().trim().max(200).nullish(),
}).transform((v) => ({ ...v, phone: blankToNull(v.phone), email: blankToNull(v.email),
                      address: blankToNull(v.address) }));
updateCustomerSchema = createCustomerSchema;
```

- **Los valores los fijó el humano en la F1.4 de QC-153** (R16). `trim()` va **antes** de `min`/`max`
  (el largo se mide ya recortado, y `'   '` no pasa el mínimo).
- **Sin formato** de correo ni teléfono (R17): ni `z.string().email()` ni patrón.
- **`z.object`, no `z.strictObject`** (R18): las claves de más se **descartan**, igual que en
  `createSupplierSchema`. Rechazarlas rompería un formulario que envíe un campo oculto de más; lo que
  el requisito exige es que **no tengan efecto**, y el test lo prueba mandando `companyId`,
  `createdBy`, `deletedAt` y `nit` y mirando lo que llega al puerto.
- **Sin `refine` cruzado**: a diferencia del proveedor, no hay «al menos uno de» entre los opcionales
  (decisión 1 y R3 de QC-153).
- **`blankToNull` se copia** en `customer-input.ts` (tres líneas); importarlo de `proveedores` ataría
  dos módulos de negocio por una utilidad trivial.

### 6.4 Salida (R22)

```ts
export type CustomerView = Omit<Customer, 'companyId' | 'deletedAt'>;
export type NewCustomer = Pick<Customer, 'firstNames' | 'lastNames' | 'city' | 'phone' | 'email' | 'address'>;
```

Se **derivan** del tipo `Customer` que dejó QC-153 en vez de repetir los campos: si el modelo gana un
campo, el compilador lo dice en los dos sitios. `companyId` no sale (quien pregunta ya es de esa
empresa) y `deletedAt` tampoco (sería siempre `null`, R25). Los autores salen como **identificadores**,
no nombres, mismo criterio que proveedores.

---

## 7. Errores y la duodécima enmienda al catálogo (R33, R34 — P4)

`domain/errors.ts`, calcado de `proveedores`:

| Clase | `code` | Cuándo |
| --- | --- | --- |
| `ClientesError` (abstracta) | — | base; `errorMessage(code)`, `diagnostic` solo para el log |
| `UnauthorizedError` | `unauthorized` | R2–R5 |
| `CustomerNotFoundError` | **`customer_not_found`** (nuevo) | R10, R23 |
| `ValidationError` | `invalid_input` | R14, R16, R26 |

**Por qué un código nuevo y no reutilizar uno.** El catálogo es cerrado (QC-70) y prohíbe el genérico
`not_found` (lo vigila `guard-catalogo-de-errores`); cada módulo tiene el suyo (`supplier_not_found`,
`recipe_not_found`…) porque cada uno lleva su frase. Reutilizar `supplier_not_found` diría
«proveedor» en la pantalla de clientes.

**La enmienda**, en tres sitios y nada más (R34):

1. `error-codes.ts`: `'customer_not_found'` al final de `ERROR_CODES`, y en la cabecera la línea
   «**Duodécima enmienda, el <fecha de aprobación>**: `customer_not_found`.» (sin citar la ficha: los
   comentarios de producción no citan fichas, `docs/conventions.md`).
2. `error-catalog.ts`: `customer_not_found: 'errors.customer_not_found'` y el texto.
   **Propuesta (P4):** `'El cliente solicitado no existe.'` —gemela de `supplier_not_found`—. Lo aprueba
   el humano en F1.4.
3. `tests/unit/errores/catalogo.test.ts`: el conteo literal pasa de **54 a 55** con su comentario.

El adaptador driving traduce con `createErrorStateTranslator(ClientesError,
observabilidad.readRequestIdHeader)`: el traductor **único**, sin copia local (lo vigila
`guard-catalogo-de-errores`).

---

## 8. Puerto y adaptador driven

```ts
// ports/customer-repository.ts
export interface CustomerRepository {
  create(data: NewCustomer, actorId: string, now: Date, scope: CustomerScope): Promise<{ id: string }>;
  findAliveById(id: string, scope: CustomerScope): Promise<CustomerView | null>;
  updateAlive(id: string, data: NewCustomer, actorId: string, now: Date, scope: CustomerScope): Promise<'ok' | 'not_found'>;
  softDeleteAlive(id: string, actorId: string, now: Date, scope: CustomerScope): Promise<boolean>;
  listAlive(query: ListQuery, scope: CustomerScope): Promise<Page<CustomerView>>;
}
```

- **`…Alive` en el nombre no es adorno**: el filtro `deletedAt: null` es del puerto (R25), así ningún
  caso de uso puede olvidarlo. Ninguna operación de restaurar ni de listar dados de baja.
- **`create`** escribe `companyScopeColumns(scope)`, los seis datos, `createdAt = updatedAt = now`,
  `createdBy = updatedBy = actorId` (R21). `updatedAt` es `@updatedAt` en Prisma, pero se escribe
  explícito con el `now` del caso de uso para que el reloj sea uno solo.
- **`updateAlive`** es `updateMany` con `{ id, deletedAt: null, ...customerCompanyScope(scope) }`;
  `data` **nunca** lleva `createdBy` ni `createdAt` (R21), y `count === 1 ? 'ok' : 'not_found'`.
- **`listAlive`** usa `toOffsetLimit`/`buildPage` de `lib/shared/pagination` (R26, R36) y un único
  `where` para `findMany` y `count` (R31). El `pageSize` que sale es el **acotado**.
- **`select` explícito** sin `companyId` ni `deletedAt`, y ningún `include` (no hay relaciones que
  incluir: QC-153 R11). Ninguna consulta a otra tabla (R35, R40).
- **Sin traducción de SQLSTATE**: no hay índice único ni `CHECK` que la aplicación pueda disparar con
  una entrada válida. Un `23502` (NOT NULL) solo llegaría si `zod` fallase, y eso **debe** ser
  `unexpected`, no un error de negocio.

---

## 9. Adaptador driving: una Server Action por operación, en un solo archivo (R32)

`adapters/driving/customer-actions.ts`, con `'use server'`, calcado de `supplier-actions.ts`:

| Acción | Entrada | Salida |
| --- | --- | --- |
| `createCustomerAction(prevState, formData)` | `FormData` | `{ status: 'success', id } \| ErrorState` |
| `updateCustomerAction(id, prevState, formData)` | `FormData` | `{ status: 'success' } \| ErrorState` |
| `deleteCustomerAction(prevState, formData)` | `FormData` con `id` | ídem; `id` vacío → `invalid_input` sin llamar al caso de uso |
| `getCustomerAction(id)` | `string` | `{ status: 'success', data: CustomerView } \| ErrorState` |
| `listCustomersAction(query)` | `unknown` | `{ status: 'success', data: Page<CustomerView> } \| ErrorState` |

- `firstNames`, `lastNames`, `city` se leen con `readFormString` (ausente → `''`, que `zod` rechaza);
  `phone`, `email`, `address` con `readOptionalFormString` (ausente → `undefined`). El blanco lo
  convierte en ausencia **el esquema**, no la acción.
- **La acción no decide nada** (R7): ni permiso, ni reglas. Solo actor, traducción de entrada y de
  resultado.
- **Sin `revalidatePath`**: esta ficha no crea pantallas y adivinar la ruta de QC-155 sería
  inventarla. **Sin route handler** ni `fetch`.
- **Un solo archivo** porque el módulo tiene una sola entidad; proveedores tiene dos porque tiene dos
  (proveedor y línea).

---

## 10. Punto de composición

Bloque **nuevo al final** de `lib/composition/index.ts`, sin reordenar ni reformatear nada de lo que hay
(otras sesiones tocan este archivo). Imports al final del bloque de imports:

```ts
const clientesListQueryLog: ClientesListQueryLog = { ignoredFields: logIgnoredListQueryFields };

const customerRepository: CustomerRepository = {
  create: createCustomer,
  findAliveById: findAliveCustomerById,
  updateAlive: updateAliveCustomer,
  softDeleteAlive: softDeleteAliveCustomer,
  listAlive: listAliveCustomers,
};

export const clientes = {
  createCustomer: createCreateCustomer({ customers: customerRepository }),
  updateCustomer: createUpdateCustomer({ customers: customerRepository }),
  deleteCustomer: createDeleteCustomer({ customers: customerRepository }),
  getCustomer:    createGetCustomer({ customers: customerRepository }),
  listCustomers:  createListCustomers({ customers: customerRepository, log: clientesListQueryLog }),
} as const;
```

Los comentarios que se añadan aquí siguen `docs/conventions.md > Comentarios`: cortos, sin citar
fichas ni requisitos, y **sin imitar** los bloques largos de alrededor.

---

## 11. Lo que QC-153 dejó escrito para esta ficha: `tests/unit/clientes/scope.test.ts`

QC-153 cerró su alcance (R20, R26 de QC-153) con aserciones que **esta ficha tiene que cambiar**
porque las invalida por diseño; dos de ellas lo anuncian en su propio mensaje («QC-154 relaja esta
regla al consumir los permisos»). Cambio por cambio, y qué **no** se toca:

| Caso actual (QC-153) | Qué pasa con QC-154 | Cambio |
| --- | --- | --- |
| `R20 — index.ts existe y solo reexporta simbolos de ./domain` | Sigue siendo verdad | **Ninguno.** La aserción de que reexporta `./domain/customer` sigue valiendo (`Customer` se conserva). |
| `R20 — las unicas carpetas del modulo son domain, ports y adapters` | Sigue siendo verdad | **Ninguno.** |
| `R20 — ports y adapters estan vacios salvo su .gitkeep…` y «domain solo tiene customer.ts» | **Falso a propósito**: esta ficha llena las tres carpetas | Se **sustituye** por la lista exacta de archivos esperada tras QC-154 (sin ningún `.gitkeep` sobrante). Sigue siendo una lista cerrada: un archivo de más la pone roja. |
| `R20 — ningun archivo alcanzable desde el contrato declara 'use server'` | Hoy barre **todo** el módulo; `customer-actions.ts` **sí** lleva `'use server'` | Se **acota** a lo que su nombre dice: todo archivo del módulo **salvo** `adapters/driving/**`, que el contrato no reexporta. La guardia de arquitectura ya cubre además el cierre transitivo del barrel. |
| `R26 — el literal de los dos permisos solo aparece en permissions.ts` | Los casos de uso nombran `'clientes.consultar'` y `'clientes.modificar'` | Se **relaja** a: `permissions.ts` **y** `lib/modules/clientes/domain/**`. Cualquier otro archivo de producción (`app/`, `components/`, otro módulo, `adapters/` de clientes) sigue en rojo. QC-155 lo volverá a abrir para su `page.tsx` y el menú. |
| `R26 — adapters/driving/ esta vacio` | Nace `customer-actions.ts` | Se **sustituye** por: `adapters/driving/` contiene **exactamente** `customer-actions.ts`. |
| `R26 — la regla de literales dispara con un archivo fabricado` | Fabrica `lib/modules/clientes/__sensibilidad_literal__.ts`, fuera de `domain/` | **Ninguno**: sigue disparando con la regla relajada. Se añade un segundo fabricado **dentro** de `domain/` que **no** debe disparar (el caso simétrico). |
| `R28 — sin ningun test E2E de clientes` (dos casos) | Sigue siendo verdad (decisión 7: E2E en QC-155) | **Ninguno.** Cierra también R38 de esta ficha. |
| `R29 — sin dependencias nuevas` (dos casos) | Compara el merge de entrada de QC-153 con su padre | **Ninguno.** R39 de esta ficha lo cierra `guard-dependencias-aprobadas`. |

Los casos cambiados conservan el `R<n>` de QC-153 en su nombre y **añaden** el de QC-154 (p. ej.
`R20 (QC-153), R35 (QC-154) — …`), para que la trazabilidad de las dos fichas siga apuntando a un test
vivo. Y el archivo gana casos propios de QC-154: sin migración ni cambio de `schema.prisma` (R37), sin
nada bajo `app/` que nombre clientes (R38), sin mención a `pedidos` (R40), y sin reimplementar la
paginación (R36).

---

## 12. Guardias y tests existentes que se **amplían** (ninguno se relaja salvo § 11)

| Archivo | Cambio | Por qué |
| --- | --- | --- |
| `tests/guards/guard-contrato-listados.test.ts` | `clientes` como séptimo de `MODULOS` (+ import) | R27: sin la fila, la copia puede divergir en silencio. |
| `tests/guards/guard-autorizacion-por-permiso.test.ts` | `'clientes'` en `BUSINESS_MODULES` | R6: el ancla «el barrido encuentra los N módulos» y «el `actor.ts` real autoriza por permiso» pasan a mirar `clientes`. Precedente: QC-87 añadió `asignaciones` así. |
| `tests/guards/guard-permisos-no-administrables.test.ts` | `'clientes'` en `BUSINESS_MODULES` | La Server Action nueva no puede escribir el catálogo de permisos; hoy la guardia no la barrería. |
| `tests/guards/guard-identificador-de-request.test.ts` | `'clientes'` en `MODULOS_DE_NEGOCIO` | El `domain/` y los `ports/` nuevos no deben mencionar el identificador de petición. |
| `tests/unit/identity/session-once-per-request-actions.test.ts` | fila `listCustomersAction` en `ACCIONES` | R7; el propio test la exige al leer el disco. |
| `tests/unit/errores/catalogo.test.ts` | 54 → 55 | R34. |
| `tests/integration/aislamiento.json` | dos entradas nuevas en `commit` (§ 13) | La guardia `guard-aislamiento-integracion` exige declarar todo `*.int.test.ts`. |
| `tests/guards/guard-ambito-empresa-clientes.test.ts` | **nuevo**, calcado del de proveedores | R12. |

`guard-arquitectura-modulos`, `guard-catalogo-de-errores`, `guard-rls-force`, `guard-empresa-en-esquema`
y `guard-dependencias-aprobadas` **no se tocan**: ya barren todos los módulos y cierran R33, R35 y R39
tal como están.

---

## 13. Cómo se verifica

**Sin E2E, con motivo** (decisión 7, R38): esta ficha no aporta nada navegable; el E2E de permisos es
de QC-155, que es donde hay pantalla y menú.

**Base de datos propia: `QuimiCloude_QC154`** (lección de QC-147). `DATABASE_URL` y `DIRECT_URL` se
sobrescriben **en el entorno del comando** para que apunten a ella —nunca a la compartida del `.env`—;
de ella sale la plantilla y la base efímera de cada corrida de integración (`tests/integration/_global-setup.ts`).
Esta ficha no tiene migración, pero la base tiene que llevar aplicada la de QC-153
(`pnpm run db:migrate` sobre `QuimiCloude_QC154` antes de la primera corrida).

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit (dominio) | `tests/unit/clientes/authorization.test.ts` | R1–R6, R8: los cinco casos rechazan sin tocar el puerto; cruces `consultar`/`modificar`; autorización antes que validación; los tres roles del seed. |
| Unit (borde) | `tests/unit/clientes/customer-input.test.ts` | R14–R18: obligatorios, blanco → ausencia, recorte, largos (máximo aceptado, máximo+1 rechazado), sin formato, claves de más sin efecto. |
| Unit (dominio) | `tests/unit/clientes/customer-service.test.ts` | R9, R13, R19–R25 con dobles del puerto: empresa del actor, reemplazo completo, autoría, `not_found`, id sin forma sin tocar el puerto, sin restaurar. |
| Unit (dominio) | `tests/unit/clientes/list-customers.test.ts` | R26 (rechazo sin leer), R27, R28: saneado contra `CUSTOMER_QUERYABLE`, log solo con nombres. |
| Unit (driving) | `tests/unit/clientes/customer-actions.test.ts` | R7, R32, R33: `FormData`/argumentos tipados, actor de la sesión, traducción por `code`, `id` vacío en la baja. |
| Unit (alcance) | `tests/unit/clientes/scope.test.ts` (ampliado, § 11) | R35 (parte), R36, R37, R38, R40. |
| Unit (catálogo) | `tests/unit/errores/catalogo.test.ts` | R34. |
| Unit (sesión) | `tests/unit/identity/session-once-per-request-actions.test.ts` | R7 (una lectura). |
| Guardia (nueva) | `tests/guards/guard-ambito-empresa-clientes.test.ts` | R12. |
| Guardia (ampliada) | `guard-contrato-listados`, `guard-autorizacion-por-permiso` | R27, R6. |
| Guardia (existente) | `guard-arquitectura-modulos`, `guard-catalogo-de-errores`, `guard-dependencias-aprobadas` | R35, R33, R39. |
| Integración | `tests/integration/clientes/customer-repository.int.test.ts` | R9, R10, R11, R13, R15, R19, R21, R23, R24, R25 contra Postgres, llamando al **adaptador real**. |
| Integración | `tests/integration/clientes/list-query-customers.int.test.ts` | R26, R29, R30, R31: más filas que una página, orden y desempate, búsqueda por palabras, comodines, total filtrado, dos empresas. |

**Las dos de integración van en `commit`, no en `transaccion`**, y su entrada en `aislamiento.json`
dice por qué: el adaptador usa el **cliente Prisma global**, así que una transacción del test con
`ROLLBACK` no lo envolvería (mismo motivo escrito para `proveedores/list-query-suppliers` y
`proveedores/company-scope-queries`). Cada archivo fabrica sus empresas efímeras con `randomUUID`
(empresa, rol, tipo de documento, usuario) y en `afterAll` borra por id exacto en el orden de las FK
—`customers` → usuarios → rol y tipo de documento → empresa— y **afirma contando** que no quedó nada.

**Avisos para el implementer**, heredados:

- El test de R2/R3 tiene que demostrar **que no se llega al repositorio**: dobles que registran y
  `expect(...).not.toHaveBeenCalled()`.
- Se afirma sobre `code`, **nunca** sobre el texto del mensaje.
- R10 se prueba **mirando la fila ajena después**: la edición y la baja de un id de otra empresa
  responden `customer_not_found` **y** la fila de la otra empresa sigue idéntica (`updated_at`,
  `updated_by`, `deleted_at`).
- Un test de RLS escrito con Prisma sale verde pase lo que pase: no se escribe.

---

## 14. Dependencias de terceros (R39)

**Ninguna nueva, y ninguna propuesta.** Todo está instalado y registrado en `docs/dependencias.md`:
`zod` (borde), `@prisma/client` (persistencia), `vitest`. Los cuatro checks de `docs/architecture.md >
Dependencias de terceros` no llegan a evaluarse. Candidatas que podrían parecerlo y no entran:
`validator`/`libphonenumber-js` (no hay formato que validar, R17) y cualquier librería de
normalización de acentos (P2: sin migración no hay columna donde usarla, y `String.normalize` del
estándar bastaría si algún día la hubiera).

---

## 15. Alternativas descartadas

### A1. Búsqueda insensible a acentos con columna normalizada o `unaccent` — descartada para esta ficha

Es lo que hace proveedores y lo que la pantalla querrá. Exige una **migración** (columnas
`*_normalized` con su backfill, o la extensión `unaccent` más un índice de expresión), y R37 —que
viene de la decisión 5: el modelo es QC-153— la deja fuera. Queda como **P2** con su coste escrito; si
el humano la quiere, es una ficha de modelo propia, no un añadido a esta.

### A2. Buscar el término entero contra cada columna — descartada

Es lo más simple (`OR` de tres `contains` con el término completo). Falla con el caso más natural:
«juan pérez» no está entero en ninguna columna, porque nombres y apellidos van separados por
decisión 1. Partir en palabras (`AND` de `OR`) cuesta tres líneas y lo resuelve (§ 6.2).

### A3. Reutilizar un código de error existente para «cliente no encontrado» — descartada

Evitaría la enmienda. Pero el genérico `not_found` está prohibido por el catálogo cerrado y
`supplier_not_found` diría «proveedor» en la pantalla de clientes. Un código por entidad es la regla
que QC-70 dejó (§ 7).

### A4. Responder `invalid_input` ante un identificador sin forma de uuid — descartada (posición P5)

Es más «honesto» sobre la causa. Pero convierte la ficha en un oráculo pequeño (distingue «ese id no
puede existir» de «ese id no existe o no es tuyo»), y para quien llama las dos cosas significan lo
mismo. Tampoco se deja llegar a la base, como hace proveedores, porque ahí sale `unexpected`, que es
peor que las dos.

### A5. Inyectar la paginación en el caso de uso, como `recetas` — descartada

Misma razón que QC-43 § 12.6: el defecto y el tope ya tienen su test en `tests/unit/pagination.test.ts`,
y el reparto de proveedores (el adaptador pagina) es el que se copia. Lo que se verifica aquí es que se
**usa** el util (R36) y un caso de integración que pide 100 y recibe 25.

### A6. Importar `list-query.ts`, `list-query-sql.ts` o `blankToNull` de `proveedores` — descartada

Ahorraría tres copias. Está prohibido por la regla de dependencias (ruta profunda a otro módulo) y el
contrato de listados ya decidió en QC-57 compartir la **forma**, no el archivo, con una guardia que
exige las copias idénticas (§ 6.1).

### A7. Edición parcial (`PATCH` campo a campo) — descartada

Con tres opcionales, un parche obliga a distinguir «no enviado» de «puesto a nulo», que es la fuente de
bugs que QC-43 § 12.4 ya descartó. Reemplazo completo, un solo esquema (R20).

### A8. Usar el tipo `Customer` de QC-153 como salida — descartada

Ya existe y ahorraría un tipo. Pero lleva `companyId` y `deletedAt`, que R22 excluye de la salida;
devolverlo haría viajar al navegador la empresa y una marca de baja siempre `null`. Se **deriva**
`CustomerView` con `Omit` (§ 6.4), sin repetir campos.

---

## 16. Preguntas abiertas que deja este diseño

Las cinco están en `requirements.md > Preguntas abiertas`. La 1 queda **cerrada por QC-153**. Las
cuatro nuevas llevan posición por defecto escrita y **ninguna bloquea la implementación**:

- **P2** acentos en la búsqueda (§ 6.2, A1) — la única cuyo cambio de opinión cuesta una migración.
- **P3** orden por defecto y campos consultables (§ 6.2) — una línea de la lista blanca.
- **P4** texto de `customer_not_found` (§ 7) — forma parte de la **enmienda al catálogo**, que requiere
  aprobación humana explícita en F1.4.
- **P5** identificador sin forma (§ 5.3, A4) — una clase de error y un caso de test.
