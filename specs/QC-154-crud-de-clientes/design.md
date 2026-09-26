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
> `adapters/.gitkeep`). Esta ficha lo consume y llena el armazón.
>
> **Enmienda F1.4 (2026-09-24).** El humano decidió que la búsqueda **ignore acentos** (P2). Eso
> trae **una migración** a esta ficha: tres columnas normalizadas, su relleno y tres índices de
> trigramas. Va en el **§ 17**, que manda sobre cualquier frase anterior que diga «sin migración».
> Las secciones afectadas llevan su nota en línea.

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
| `lib/modules/errores/domain/error-codes.ts`, `error-catalog.ts` | **Decimotercera enmienda**: `customer_not_found` (§ 7). |
| `tests/…` | Nuevos y **ampliados**; ver § 11, § 12 y § 17. |
| `db/schema.prisma` | *(F1.4)* `Customer` gana `firstNamesNormalized`, `lastNamesNormalized` y `cityNormalized`. Nada más (§ 17). |
| `db/migrations/<ts>_customers_search_normalized/{migration.sql,down.sql}` | *(F1.4)* Columnas, relleno, `NOT NULL` y tres GIN de trigramas parciales, escritos a mano (§ 17). |
| `lib/modules/clientes/domain/customer-text.ts` | *(F1.4)* `normalizeCustomerText`, la única normalización del módulo. |

**No se toca** ninguna otra parte de `db/` (R37 enmendado), `app/`, `components/`, `hooks/`, `e2e/`, `middleware.ts` (R38),
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

> **F1.4 (2026-09-24): lo que sigue sobre semántica, acentos y comodines queda REEMPLAZADO por
> § 17.3.** La búsqueda compara **formas normalizadas**, no las columnas en crudo con `ILIKE`. Se
> conserva el texto original para que se vea qué cambió.

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

*(F1.4)* `NewCustomer` gana además `firstNamesNormalized`, `lastNamesNormalized` y `cityNormalized`.
Los calcula **el caso de uso** con `normalizeCustomerText`, igual que `create-supplier.ts` empareja
`name` y `nameNormalized`, para que el emparejamiento se vea con un doble del puerto (R42).
`CustomerView` **no** los lleva (R47). El tipo `Customer` de QC-153 **no se toca**.

Se **derivan** del tipo `Customer` que dejó QC-153 en vez de repetir los campos: si el modelo gana un
campo, el compilador lo dice en los dos sitios. `companyId` no sale (quien pregunta ya es de esa
empresa) y `deletedAt` tampoco (sería siempre `null`, R25). Los autores salen como **identificadores**,
no nombres, mismo criterio que proveedores.

---

## 7. Errores y la decimotercera enmienda al catálogo (R33, R34 — P4)

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
   «**Decimotercera enmienda, el <fecha de aprobación>**: `customer_not_found`.» (sin citar la ficha: los
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
- *(F1.4)* **`create` y `updateAlive` escriben también las tres formas normalizadas** que les llegan
  en `NewCustomer`, sin volver a normalizar nada: si hubiera dos definiciones, podrían divergir (R42).
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
vivo. Y el archivo gana casos propios de QC-154: *(F1.4)* solo **una** migración nueva, la de § 17,
y en `schema.prisma` solo los tres campos normalizados de `Customer` (R37 enmendado); sin
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
| `tests/guards/guard-identificador-de-request.test.ts` | *(F1.4)* el nombre de la migración nueva en su **lista cerrada** de migraciones, con el comentario de una línea de siempre | Sin la fila, `hallazgosDeMigraciones` se pone roja con la migración nueva. |
| `tests/unit/clientes/schema/customers-schema.test.ts` (QC-153) | *(F1.4)* `CUSTOMER_COLUMNS` gana los tres campos normalizados. El caso cambiado lleva `R4 (QC-153), R42 (QC-154)` en el nombre y **sigue siendo un censo exacto** | Hoy es un censo cerrado de columnas y se pondría rojo. Las columnas nuevas son **derivadas**, no dato de negocio: R4 de QC-153 («ningún dato de negocio distinto de los seis») sigue siendo verdad. |
| `tests/integration/clientes/customers-constraints.int.test.ts` (QC-153) | *(F1.4)* Los `tx.customer.create` y el `INSERT` crudo del ayudante pasan las tres formas normalizadas, y el censo de columnas en `snake_case` gana las tres | Sin esto no compila (Prisma las exige como obligatorias) o la base las rechaza por `NOT NULL`. |

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
*(F1.4)* La migración de § 17 se aplica, se revierte y se vuelve a aplicar **contra
`QuimiCloude_QC154`** (`db:migrate` → `db:rollback` → `db:migrate`), y la salida se pega en la
bitácora. La base necesita antes la migración de QC-153.

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

### A1. Búsqueda insensible a acentos con columna normalizada — **YA NO DESCARTADA (F1.4, 2026-09-24)**

La descarté en F1.2 porque exigía una migración. En F1.4 **el humano la eligió**, y se implementa en
**esta** ficha (§ 17). Queda como constancia de que la posición por defecto era otra.

### A1-bis. `unaccent` con índice de expresión en vez de columna almacenada — descartada

Evitaría las tres columnas: bastaría un `CREATE INDEX … (unaccent(lower(first_names)) gin_trgm_ops)`
y un `WHERE unaccent(lower(...)) LIKE`. Se descarta por tres razones:

- **Nadie la usa en el repositorio.** La cabecera de `20260904160000_list_query_indexes` explica por
  qué eligió `translate` y no `unaccent()`.
- **`unaccent()` no es `IMMUTABLE`**, así que no entra en un índice sin una función envoltorio.
- **La comparación se partiría en dos definiciones**, una en SQL y otra en TypeScript, que pueden
  divergir. El precedente (§ 17) tiene una sola definición: la de la aplicación, que escribe la
  columna y normaliza el término.

El `translate` solo se usa una vez, para el relleno.

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

> **F1.4 (2026-09-24): las cuatro están cerradas.** P3, P4 y P5 se aceptan como estaban. P2 cambia a
> «ignora acentos» (§ 17). El texto que sigue se conserva como historia.

Las cinco están en `requirements.md > Preguntas abiertas`. La 1 queda **cerrada por QC-153**. Las
cuatro nuevas llevan posición por defecto escrita y **ninguna bloquea la implementación**:

- **P2** acentos en la búsqueda (§ 6.2, A1) — la única cuyo cambio de opinión cuesta una migración.
- **P3** orden por defecto y campos consultables (§ 6.2) — una línea de la lista blanca.
- **P4** texto de `customer_not_found` (§ 7) — forma parte de la **enmienda al catálogo**, que requiere
  aprobación humana explícita en F1.4.
- **P5** identificador sin forma (§ 5.3, A4) — una clase de error y un caso de test.

---

## 17. F1.4 (2026-09-24): búsqueda sin acentos — la migración (R37 enmendado, R41–R47)

### 17.1 El precedente que se copia (verificado en el árbol, no supuesto)

| Pieza | Dónde está hoy | Qué se copia |
| --- | --- | --- |
| Columna normalizada **escrita por la aplicación** | `products`, `recipes`, `suppliers`, `presentations`, `units`, `supplier_catalog_lines` (`name_normalized`); `normalizeSupplierName` en `proveedores/domain/supplier-name.ts` | Una columna `*_normalized` por campo buscable. Una función de dominio: `NFD`, quitar `\p{Diacritic}`, `toLowerCase`, quitar `[^a-z0-9]`. |
| Relleno en SQL con `translate`, **sin `unaccent`** | `db/migrations/20260904160000_list_query_indexes/migration.sql` § 2 | Se añade la columna **anulable**, se hace el `UPDATE … regexp_replace(lower(translate(…)), '[^a-z0-9]', '', 'g')` con **la misma** lista de caracteres, y **después** `SET NOT NULL`. |
| Índice de búsqueda | Misma migración, § 3: `USING gin (<col> gin_trgm_ops) WHERE deleted_at IS NULL` | Tres índices parciales, uno por columna. |
| Extensión | Misma migración: `CREATE EXTENSION IF NOT EXISTS pg_trgm`, y el `down.sql` **no** la retira | Igual: `IF NOT EXISTS` en el UP, **ningún** `DROP EXTENSION` en el DOWN (R45, R46). |
| El término se normaliza con la **misma** función que escribió la columna | `normalizedSearchCondition(search, normalize)` en `proveedores/.../list-query-sql.ts` | Igual, pero **por palabra** (§ 17.3). |
| Búsqueda de pedidos por nombre de receta (QC-68) | `pedidos` resuelve primero los ids de receta contra `recipes.name_normalized` (índice `recipes_name_normalized_all_trgm_idx`) y después filtra pedidos por `recipeId IN (…)` | Confirma el mecanismo: columna normalizada + trigramas. **No** se copia el paso de dos consultas, porque aquí las columnas están en la misma tabla. |

### 17.2 Esquema y migración

```prisma
model Customer {
  // … lo de QC-153, sin tocar …
  firstNamesNormalized String @map("first_names_normalized")
  lastNamesNormalized  String @map("last_names_normalized")
  cityNormalized       String @map("city_normalized")
}
```

Sin `@unique` y sin `@@index`: los índices parciales no los modela Prisma y viven solo en el SQL,
igual que los de la migración precedente (R44, R45). Hay que actualizar el comentario `///` del
modelo, que hoy dice «no hay columna normalizada».

`db/migrations/<ts>_customers_search_normalized/migration.sql`. `<ts>` tiene que ser **posterior a la
última migración de `dev` en el momento de crearla**; hoy la última conocida es `20260924180000`.

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm;`
2. `ALTER TABLE "customers" ADD COLUMN "first_names_normalized" text;` y lo mismo para
   `last_names_normalized` y `city_normalized`.
3. `UPDATE "customers" SET "first_names_normalized" = regexp_replace(lower(translate("first_names",
   '<lista del precedente>', '<lista del precedente>')), '[^a-z0-9]', '', 'g'), …` para las tres,
   **sobre todas las filas**, vivas y dadas de baja (R43). El filtro de borrado solo aplica al índice,
   no al dato.
4. `ALTER TABLE "customers" ALTER COLUMN "…_normalized" SET NOT NULL;` para las tres (R44).
5. `CREATE INDEX "customers_first_names_normalized_trgm_idx" ON "customers" USING gin
   ("first_names_normalized" gin_trgm_ops) WHERE "deleted_at" IS NULL;` y sus gemelos
   `customers_last_names_normalized_trgm_idx` y `customers_city_normalized_trgm_idx` (R45).

La migración se escribe **a mano**, con la misma cabecera de aviso de drift que la precedente:
`customers` tiene FK escalares, clave candidata y RLS que Prisma no conoce, así que generarla con
Prisma emitiría `DROP` de drift. **Ningún `DROP` en el UP.**

`down.sql` (R46), en orden inverso: `DROP INDEX IF EXISTS` de los tres, y después
`ALTER TABLE "customers" DROP COLUMN IF EXISTS` de las tres columnas. **Sin `DROP EXTENSION`**, por la
misma razón escrita en el `down.sql` precedente.

**Diferencia de juego de caracteres, aceptada como en el precedente.** El `translate` cubre las vocales
con tilde, diéresis y circunflejo, y la `ñ`. La función de TypeScript cubre además cualquier diacrítico
Unicode, como `ç` o `ã`. Una fila **ya existente** con uno de esos caracteres quedaría rellenada distinto
de como la escribiría la aplicación, hasta su siguiente edición. R43 exige la coincidencia **solo en el
juego del precedente**, que es lo que su test comprueba. `customers` nació ayer (QC-153) y lo más
probable es que esté vacía en producción. **No se amplía la lista**: sería apartarse del precedente sin
que nadie lo haya pedido.

### 17.3 Búsqueda y filtro (R41, R47)

- `domain/customer-text.ts`: `normalizeCustomerText(value)`, la misma forma que `normalizeSupplierName`.
  Se **copia**: importarla de `proveedores` es ruta profunda prohibida (A6).
- **Búsqueda.** Lo hace el adaptador: parte el término por espacios, normaliza cada palabra con
  `normalizeCustomerText` y descarta las vacías. Si no queda ninguna, no hay búsqueda (R41, mismo
  criterio que `normalizedSearchCondition`). Si queda alguna:
  `AND` de `{ OR: [{ firstNamesNormalized: { contains: w } }, { lastNamesNormalized: { contains: w } },
  { cityNormalized: { contains: w } }] }`, **sin** `mode: 'insensitive'` (la columna ya está en
  minúsculas y sin acentos, y así puede usar el índice de trigramas, como en proveedores).
- **Por qué sigue siendo por palabras.** La normalización quita los espacios, así que «Juan Carlos» se
  guarda como `juancarlos`. Por eso cada palabra se busca por separado: «carlos pérez» encuentra a
  *Juan Carlos* / *Pérez Gómez*.
- **Comodines.** `%` y `_` desaparecen al normalizar. La cláusula de R30 sobre comodines queda
  absorbida: un término hecho solo de símbolos es ausencia de búsqueda, como en todos los listados del
  repositorio. El caso de integración «`%` no devuelve a todos» **se sustituye** por «un término hecho
  solo de símbolos equivale a no buscar».
- **Filtro de ciudad (R47).** `city: 'text'` se traduce a `{ cityNormalized: { contains:
  normalizeCustomerText(value) } }`, **no** a `textCondition` sobre la columna en crudo. Aquí se aparta
  de proveedores, cuyos filtros de texto van contra la columna en crudo. Si no, buscar «bogota»
  encontraría «Bogotá» y filtrar por «bogota» no, sobre la **misma** columna. Un valor que queda vacío
  al normalizar deja el filtro sin efecto.
- **Orden.** Sigue sobre las columnas **en crudo** (`last_names`, `first_names`): el orden que se
  muestra es el del dato que se muestra.
- **Lo que no entra.** Los índices btree de **orden** que `list_query_indexes` creó para los siete
  listados de entonces **no** se añaden. La decisión F1.4 habla de la búsqueda, y el orden de los
  clientes de una empresa no los necesita. Añadirlos después es una migración de cinco líneas.

### 17.4 Tests que añade la migración

| Nivel | Archivo | Qué demuestra |
| --- | --- | --- |
| Unit | `tests/unit/clientes/customer-text.test.ts` | Normalización: acentos, mayúsculas, `ñ`, símbolos, espacios; y que da **lo mismo** que `normalizeSupplierName` sobre una batería (las dos definiciones no se separan en silencio). |
| Unit | `tests/unit/clientes/customer-service.test.ts` (ampliado) | R42: el alta y la edición pasan al puerto cada forma normalizada emparejada con su dato. |
| Estático | `tests/unit/clientes/schema/customers-search-migration.test.ts` | R43–R46, con **sensibilidad**. El UP añade las tres columnas anulables, las rellena **antes** del `SET NOT NULL` y usa la lista de `translate` **idéntica** a la del precedente (leída de su archivo, no copiada en el test). Tres GIN `gin_trgm_ops` parciales, `CREATE EXTENSION IF NOT EXISTS`, ningún `DROP`, ningún `UNIQUE`, ninguna otra tabla. El DOWN lo revierte todo sin `DROP EXTENSION`. Se comprueba que el test se pone rojo al: poner el `SET NOT NULL` antes del `UPDATE`, quitar un `WHERE deleted_at IS NULL`, meter un `DROP EXTENSION` en el DOWN. |
| Integración (`transaccion`) | `tests/integration/clientes/customers-search-migration.int.test.ts` | **R43**, dentro de una transacción con `ROLLBACK`: se revierte la migración con su `down.sql`, se insertan clientes vivos y dados de baja con acentos, se aplica el UP y se compara cada valor con `normalizeCustomerText`. **R44**: `NOT NULL` real (`23502`). **R45**: los tres índices en `pg_indexes`, con su predicado. |
| Integración | `tests/integration/clientes/list-query-customers.int.test.ts` (ampliado) | R41, R47 contra el motor: «maria» encuentra «María», «PEREZ» encuentra «Pérez», «bogota» filtra «Bogotá»; palabras en columnas distintas; término de solo símbolos. |
| Ciclo real | task T17 | R46: `db:migrate` → `db:rollback` → `db:migrate` sobre `QuimiCloude_QC154`, con la salida en la bitácora. |

### 17.5 Complejidad y solapes

- **Complejidad.** La ficha pasa de CRUD puro a CRUD con una migración con relleno. Además hay que
  enmendar **dos tests de QC-153** (el censo del esquema y los `create` de su test de restricciones).
  Es del tamaño de QC-43, que tuvo tres cambios de esquema y se clasificó `high`. **Propongo subirla
  de `medium` a `high`**; lo decide el leader.
- **Solape con QC-150** (`producto-terminado`, `in_progress`, zona `fullstack`). QC-150 también añade
  migraciones y toca `db/schema.prisma`, aunque en otros modelos (`Presentation`, `Product` y los
  enums). Los archivos comunes son tres:
  - `db/schema.prisma`: modelos distintos, conflicto de texto improbable pero posible.
  - `tests/guards/guard-identificador-de-request.test.ts`: las dos fichas añaden su migración al
    final de la **misma lista cerrada**, así que el conflicto de merge es seguro y trivial.
  - El **orden de las marcas de tiempo**: la que se mergee después tiene que llevar una marca
    posterior a la última de `dev`, como exige el propio spec de QC-150.

  No hay solape de tablas ni de módulos. Lo que el leader debe considerar es el conflicto en esos dos
  archivos compartidos, no el cupo de zona (son zonas distintas).
