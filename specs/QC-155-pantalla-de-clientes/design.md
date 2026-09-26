# QC-155 — pantalla-de-clientes · design.md

> Zona `frontend` · Complejidad `medium` · depends_on `QC-154` (done) · Rama `feature/QC-155-pantalla-de-clientes`
>
> El **qué** está en `requirements.md` (R1–R42). Aquí va el **cómo**: la capa visual sobre un backend
> ya mergeado (QC-153 modelo, QC-154 CRUD), qué se copia de qué pantalla, qué archivos ajenos se tocan
> y qué tests heredados se tensan o se sustituyen.
>
> **Esta ficha no inventa patrones: combina dos que ya están en `dev`.** El esqueleto de pantalla con
> corte por `consultar` y escrituras ocultas sin `modificar` es el de **usuarios** (QC-67). La lista
> que navega en una transición sin desmontar la tabla, con la caja de búsqueda sincronizada con la URL,
> es la de **pedidos** (QC-122, `order-table.tsx`). El parser de parámetros con filtro de fecha es el de
> **recetas** (`recipe-list-params.ts`). La pantalla de **proveedores** que cita el encargo ya no es
> lista con tabla compartida: QC-140 la convirtió en escaparate (`supplier-showcase-*`) y
> `supplier-list-params.ts` ya no existe. Su patrón de lista vive hoy en esas tres pantallas.

---

## 0. Estado real del repo (verificado en `dev` el 2026-09-25, no supuesto)

| Hecho | Evidencia |
| --- | --- |
| Las cinco Server Actions existen. `create`/`update`/`delete` reciben `FormData` con la firma de `useActionState`. `update` es `(id, prevState, formData)`, así que necesita `bind`. `delete` lleva el `id` en un campo oculto. Ninguna llama a `revalidatePath` | `lib/modules/clientes/adapters/driving/customer-actions.ts` |
| Campos del `FormData`: `firstNames`, `lastNames`, `city` (ausente → `''`), `phone`, `email`, `address` (ausente → `undefined`; el blanco lo convierte en ausencia el esquema) e `id` en la baja | ídem, `buildCustomerCandidate` |
| Tipos de estado exportados: `CreateCustomerFormState`, `CustomerMutationFormState`, `CustomerListResult`, `CustomerQueryResult`. El literal `{ status: 'idle' }` lo construye quien consume | ídem |
| El contrato es importable desde cliente y publica `CUSTOMER_QUERYABLE`, `createCustomerSchema`/`updateCustomerSchema`, las seis constantes de largo, `CustomerView`, `Page` y las clases de error | `lib/modules/clientes/index.ts` |
| `CUSTOMER_QUERYABLE`: ordenables `firstNames`, `lastNames`, `city`, `createdAt`, `updatedAt`. Filtrables `city: 'text'` y `createdAt: 'dateRange'`. `searchable: true` | QC-154 `design.md > 6.2` |
| `CustomerView` = `Customer` sin `companyId` ni `deletedAt`: id, los seis datos, `createdAt`, `updatedAt`, `createdBy`, `updatedBy` (ids). Sin formas normalizadas | QC-154 R22, R47 |
| Códigos que puede devolver el módulo: `unauthorized`, `customer_not_found`, `invalid_input`, `unexpected` | QC-154 `design.md > 7` |
| Los permisos `clientes.consultar` y `clientes.modificar` existen y el seed los da **solo** al Administrador | QC-153; `SEED_ROLE_PERMISSIONS` |
| `requirePagePermission(code)` redirige al login sin sesión y responde 404 dentro del layout sin permiso | `lib/modules/identity/adapters/driving/require-page-permission.ts`, usado en todas las `page.tsx` privadas |
| `NavLink.permission` es obligatorio y el layout filtra con `filterNavItemsByPermissions` en el servidor. `firstVisibleNavHref` recorre el array en orden | `lib/shared/navigation/private-nav.ts` |
| `NavIconName` no tiene ningún icono de «cliente». `users` ya lo usa Usuarios. `lucide-react` 1.29.0 exporta `Contact` | `nav-icons.ts`; `node_modules/lucide-react/dist/lucide-react.d.ts` |
| Hay dos patrones de lista en `dev`. **(a)** `<Suspense key={query}>` + `router.push` (unidades, usuarios, presentaciones): remonta todo en cada cambio y la caja pierde el foco al teclear. **(b)** `<Suspense>` sin `key` + `useTransition` (pedidos, inventario, recetas, catálogo de proveedores): no desmonta nada. Solo **pedidos** añade la sincronización de la caja con «Atrás» (QC-122 R27, `boxEpoch` + `pendingSearches`) | `pedidos/page.tsx:40-43`, `order-table.tsx:143-215` |
| QC-122 dejó escrito que proveedores e inventario siguen con ese fallo y que el arreglo vive en la tabla de la pantalla, **sin tocar** `components/shared` | `specs/QC-122-.../requirements.md`, decisión del 2026-09-23 |
| La tabla compartida soporta filtros `text` y `dateRange` y debounce de búsqueda de 300 ms | `components/shared/data-table/data-table-types.ts`, `data-table-params.ts` |
| Listas cerradas que exigen alta de una pantalla o un E2E nuevos: consumidores de la tabla compartida y E2E que la localizan (`tests/unit/shared/data-table-alcance.test.ts`), `E2E_ESPERADOS` (`tests/guards/guard-identificador-de-request.test.ts`), el ancla del menú (`tests/unit/navegacion/private-layout-menu.test.tsx`) y `PRIVATE_ROUTE_PREFIXES` contra el árbol (`guard-rutas-privadas-cubiertas`) | archivos citados |
| `tests/unit/clientes/scope.test.ts` tiene **tres** aserciones de «aún no hay pantalla» que esta ficha invalida por diseño, y QC-154 lo dejó anunciado («QC-155 lo volverá a abrir para su `page.tsx` y el menú») | `scope.test.ts:216` (R26, literal de permisos), `:266-285` (R28, sin E2E), `:472-497` (R38, nada en `app/`); QC-154 `design.md > 11` |

**Conclusión operativa.** No falta backend. Todo lo que se construye es de `app/(private)/clientes/`,
más una constante de ruta, un ítem de menú con su icono y el alta en listas cerradas de tests.

---

## 1. Archivos: qué se crea y qué se toca

```
lib/shared/routes.ts                         # EDITA: CUSTOMERS_ROUTE + fila en PRIVATE_ROUTE_PREFIXES (R1, R2)
lib/shared/navigation/private-nav.ts         # EDITA: CUSTOMERS_LABEL, 'contact' en NavIconName, item al final (R4)
lib/shared/navigation/nav-icons.ts           # EDITA: fila contact: Contact (R4)

app/(private)/clientes/
  page.tsx                                   # Server Component: corte + canModify + Suspense (R3, R5, R17, R21)
  components/
    index.ts                                 # barrel (R36)
    customer-labels.ts                       # reexporta CUSTOMERS_LABEL + textos de la tabla (R40)
    customer-list-params.ts                  # parser/serializador puro de la URL (R12-R17)
    customer-columns.tsx                     # columnas como datos (R10, R11, R13, R14)
    customer-list-section.tsx                # Server Component async: listCustomersAction una vez (R19, R20, R22)
    customer-table.tsx                       # cliente: DataTable + transicion + sincronizacion de la caja (R9, R12, R18, R21, R23)
    customer-list-skeleton.tsx               # primera carga (R21)
    customer-list-empty.tsx                  # vacio propio de clientes (R19)
    customer-list-error.tsx                  # error + reintento (R22)
    customer-row-actions.tsx                 # editar / dar de baja, solo con canModify (R5)
    customer-form.tsx                        # <form action> + useActionState + esquema del contrato (R25-R28)
    customer-sheet.tsx                       # panel lateral de alta y edicion (R24, R30)
    delete-customer-dialog.tsx               # confirmacion que nombra al cliente (R31, R32)

e2e/clientes.spec.ts                         # R41, R42
```

**Archivos ajenos que se tocan, y ninguno más** (R35): los tres de `lib/shared/` de arriba y los tests
de §10. Si una task pide abrir `lib/modules/**`, `lib/composition/**`, `db/**` o
`components/shared/**`, **se para y se avisa**.

**No hay página de detalle** `/clientes/[id]`: el cliente son seis campos planos que caben en la fila y
en el panel (alternativa D).

---

## 2. Ruta, protección y menú (R1–R4, R6)

### 2.1 Constante y prefijo

```ts
// lib/shared/routes.ts
export const CUSTOMERS_ROUTE = '/clientes';
// PRIVATE_ROUTE_PREFIXES gana CUSTOMERS_ROUTE al final, con su comentario de una linea.
```

Nace aquí y no en `private-nav.ts`, por el mismo motivo escrito para todas las demás constantes. La
fila del prefijo y `app/(private)/clientes/page.tsx` **entran en la misma task**:
`guard-rutas-privadas-cubiertas` se pone roja en los dos sentidos. Sin helper de detalle, porque no hay
detalle.

### 2.2 Corte por permiso en la página

Copia de `configuracion/usuarios/page.tsx`:

```ts
export default async function ClientesPage({ searchParams }) {
  await requirePagePermission('clientes.consultar');          // primera linea (R3)
  const resolved = await searchParams;
  const canModify = await canModifyCustomers();               // R5
  const params = parseCustomerListParams(resolved);
  return ( ... <Suspense fallback={<CustomerListSkeleton rows={params.pageSize} />}>
                 <CustomerListSection params={params} canModify={canModify} />
               </Suspense> ... );
}
```

- **Un solo corte, `consultar`**, igual que usuarios y a diferencia de unidades. La decisión 3 separa
  «ver» de «modificar», y QC-74 decidió que `modificar` no implica `consultar`. Hoy los dos solo los
  tiene el Administrador, así que en el seed no hay nadie en medio. Lo cubre el test unitario de R5,
  no el E2E.
- `canModifyCustomers()` es la copia literal de `canModifyUsers()`: `identity.getSessionUser()` +
  `assertPermission(user, 'clientes.modificar', () => PERMISO_DENEGADO)` reconocido por identidad.
  **No** es un `permissions.includes(...)`: una segunda definición de pertenencia podría divergir de
  la única (QC-74 R12). No hace falta `currentUserId`: aquí no hay «uno mismo».
- La autorización real sigue en los cinco casos de uso. Si una acción responde `unauthorized`, se
  pinta el estado de error (R7).

### 2.3 El ítem del menú (R4, R6; posición por defecto P2)

```ts
// private-nav.ts
export const CUSTOMERS_LABEL = 'Clientes';
export type NavIconName = ... | 'contact';
{ kind: 'link', href: CUSTOMERS_ROUTE, label: CUSTOMERS_LABEL, testId: 'nav-clientes',
  permission: 'clientes.consultar', icon: 'contact', section: NAV_SECTION_CHAIN },   // ULTIMO del array
```

- **Último del array.** `groupNavItemsBySection` agrupa por sección en orden de aparición, así que se
  dibuja dentro de «Cadena» tras Proveedores. `firstVisibleNavHref` recorre el array crudo, así que
  ponerlo al final **no cambia el aterrizaje** de ningún rol (R4). Es el mismo razonamiento que dejó
  escrito QC-67 para Usuarios.
- **«Cadena»** y no «Operación» es la posición por defecto de P2. Además, en «Operación» rompería
  el caso «usuarios es el ÚLTIMO item de la sección Operación» de `private-nav-usuarios.test.ts`. Si el
  humano elige «Operación», ese test se reescribe en la misma task (no se relaja: pasa a nombrar el
  nuevo último).
- **Icono nuevo `contact`** → `Contact` de `lucide-react` (ya instalado, no es dependencia nueva). El
  `Record<NavIconName, LucideIcon>` obliga a añadir la fila en `nav-icons.ts`: olvidarla no compila.
- `guard-nav-permisos-declarados` ya exige que el código exista en `PERMISSIONS`, y existe.
- **Mismo código en ítem y página.** `private-nav-clientes.test.ts` **lee** los
  `requirePagePermission('…')` de la fuente de `page.tsx` (copia del patrón de
  `private-nav-usuarios.test.ts`) y afirma que es exactamente uno e igual al del ítem.

---

## 3. Contratos de entrada y salida

| Contrato | Valor |
| --- | --- |
| Props de la página | `searchParams: Promise<CustomerListSearchParams>` (`Record<string, string \| readonly string[] \| undefined>`) |
| Lista | `listCustomersAction(params: DataTableParams)` → `CustomerListResult`. `DataTableParams` es campo a campo la forma de `ListQuery` y se pasa **entero y sin claves de más** (el esquema es `strictObject`) |
| Alta | `createCustomerAction(prevState, formData)` → `CreateCustomerFormState` |
| Edición | `updateCustomerAction.bind(null, customer.id)` en el componente de cliente → `CustomerMutationFormState` |
| Baja | `deleteCustomerAction(prevState, formData)` con `id` en campo oculto → `CustomerMutationFormState` |
| Ficha | `getCustomerAction` **no se usa** (alternativa B) |
| Import | Las acciones por **ruta exacta** `@/lib/modules/clientes/adapters/driving/customer-actions` (R34). Tipos, esquema y lista blanca por el barrel `@/lib/modules/clientes` |
| Modelo de datos, tablas, RLS, migraciones | **NO APLICA** (§9) |
| Integraciones externas / variables de entorno | Ninguna nueva |

---

## 4. Parámetros de lista en la URL (R12–R17)

`customer-list-params.ts` es la copia de `recipe-list-params.ts`, sin React ni `next/*`, con **un
añadido**: el filtro de texto de ciudad.

| Parámetro | Nombre en la URL | Regla de acotado |
| --- | --- | --- |
| página | `page` | entero ≥ 1 escrito como dígitos; otra cosa → 1 |
| tamaño | `pageSize` | solo `PAGE_SIZE_OPTIONS` (10, 25) de la tabla compartida; otra cosa → `DEFAULT_PAGE_SIZE` |
| orden | `sort=campo:asc\|desc` | `campo` en `CUSTOMER_QUERYABLE.sortable`; si no, `null` (orden por defecto del módulo, R14) |
| búsqueda | `q` | recortada; vacía = sin búsqueda; **sin normalizar** (R12) |
| ciudad | `city` | solo si `CUSTOMER_QUERYABLE.filterable.city === 'text'`; recortada; vacía = sin filtro → `{ kind: 'text', value }` |
| fecha de alta | `createdFrom`, `createdTo` | solo si `filterable.createdAt === 'dateRange'`; `AAAA-MM-DD` que exista → `{ kind: 'dateRange', from, to }` |

Exporta `parseCustomerListParams`, `buildCustomerListQuery` (canónica: sin claves vacías, y
`parse(build(p))` devuelve `p`), `customerListHref` (derivada de `CUSTOMERS_ROUTE`),
`hasActiveSearchOrFilter`, `clearSearchAndFilters` y `withSearchResetsPage` (copia de pedidos). Un
cambio de filtro también vuelve a la página 1 (R13): se extiende la misma función a «cambió el término
**o** los filtros».

**Por qué un parser propio y no importar el de recetas:** importar la carpeta `components/` de otra
ruta ata dos rutas por sus internos. El precedente es que cada ruta tenga el suyo.

---

## 5. Lista: estados, transición y la caja de búsqueda (R9, R18–R23)

### 5.1 Sección de servidor

`CustomerListSection` (async) llama a `listCustomersAction(params)` **una vez** y despacha:

| Resultado | Qué pinta |
| --- | --- |
| `status: 'error'` | `CustomerListError` con `message`, `code` y un reintento que es un enlace a `customerListHref(params)` (R7, R22) |
| 0 filas, sin término ni filtro, página 1 | `CustomerListEmpty` (`customer-list-empty`), con disparador de alta **solo si `canModify`** (R19) |
| 0 filas, `page > totalPages` | vacío con enlace a la primera página (R20) |
| 0 filas con término o filtro | `CustomerTable` con `noMatches={{ clearHref }}`: la tabla sigue montada, con su caja, y pinta «sin coincidencias» en su estado vacío con `data-testid="customer-list-no-matches"` y el enlace de limpiar (R20). Es el patrón de pedidos |
| filas | `CustomerTable` |

### 5.2 Sin `key` en el `<Suspense>`, navegación en transición

`page.tsx` monta `<Suspense fallback={<CustomerListSkeleton/>}>` **sin `key`**, como pedidos. El
esqueleto cubre la primera carga (R21). En cada cambio, `CustomerTable` navega con
`startTransition(() => router.push(customerListHref(next)))` y mientras `isPending` pinta
`aria-busy`, la tabla atenuada y un rótulo con `data-testid="customer-table-loading"`. **No** pasa
`status="loading"` a la `DataTable`, porque ese estado sustituye las filas y la caja se desmontaría
(R21, R18).

### 5.3 La caja sincronizada con «Atrás» (R18) — **decisión: SÍ aplica, y se copia de QC-122**

La búsqueda es la operación central de esta pantalla, así que el fallo que QC-122 arregló en pedidos
aparecería aquí tal cual. `DataTableSearchField` guarda su borrador una vez al montarse: tras buscar A,
luego B, y pulsar «Atrás», la lista y la URL vuelven a A pero la caja seguiría diciendo B.

Se copia **el mecanismo de `order-table.tsx:143-215`**, sin tocar `components/shared`:

- estado `boxEpoch` (número) → `key={boxEpoch}` en la `DataTable`;
- cola `pendingSearches` con los términos que emitió la propia caja, y `lastSearch`;
- **durante el render** (no en un efecto, para que no parpadee): si `params.search !== lastSearch`, se
  mira la cola. Si el término está, es el eco de la propia caja: se consume y **no** se remonta, así
  que se conservan el foco y el texto. Si no está, vino de fuera (Atrás, enlace): `boxEpoch + 1` y la
  caja renace con el término de la URL;
- `clearing` para el enlace de limpiar de «sin coincidencias», con `isPlainClick` para no
  interceptar clic con modificador.

Es una **segunda copia** de unas 40 líneas. Promoverlo a la tabla compartida sería lo correcto con dos
consumidores, pero exige tocar `components/shared/data-table`, que R9 y `data-table-alcance` prohíben
en esta ficha. Queda anotado como deuda con nombre (§12, riesgo 3) y no se hace aquí (alternativa F).

### 5.4 Columnas (R10, R11, R13, R14)

`customer-columns.tsx` declara las columnas como datos (`DataTableColumn<CustomerView>`):

| id | sortable | filter | celda |
| --- | --- | --- | --- |
| `lastNames` | sí | — | texto |
| `firstNames` | sí | — | texto |
| `city` | sí | `{ kind: 'text' }` | texto |
| `phone` | — | — | texto o marcador `customer-cell-empty` (R11) |
| `email` | — | — | ídem |
| `address` | — | — | ídem |
| `createdAt` | sí | `{ kind: 'dateRange' }` | `AAAA-MM-DD` en **UTC** (copia de `formatDate` de `recipe-columns.tsx`: la hora local descuadra la hidratación) |
| `updatedAt` | sí | — | ídem |
| `actions` | — | — | `CustomerRowActions`, solo con `canModify`. Columna normal y siempre visible, sin `:hover` |

`sortable` no se escribe a mano: `sortable: CUSTOMER_QUERYABLE.sortable.includes(id)`, y el test
afirma que el conjunto de ordenables es **igual** a la lista blanca. Lo mismo para `filter` contra
`filterable`. **Apellidos antes que nombres** porque es el orden por defecto del módulo. Es presentación
y no cambia R10 (P3). Nunca `createdBy`/`updatedBy`/`id`: el test de R10 recorre las columnas en
negativo.

---

## 6. Formulario y panel lateral (R24–R30)

Copia de `unit-form.tsx` / `unit-sheet.tsx` / `user-form.tsx`:

- `CustomerSheet` monta un `Sheet` de shadcn (ya instalado) en modo `create` (disparador
  `customer-create-open` en `toolbarActions` de la tabla y en el vacío) o `edit` (desde la fila).
  Abrir y cerrar **no navega**: la URL de la lista no cambia, y por eso se conservan los parámetros
  (R24).
- `CustomerForm`: `<form action={formAction}>` **no controlado**,
  `useActionState(action, { status: 'idle' })` (el literal lo construye la pantalla, R34), botón
  deshabilitado mientras `isPending`.
- **Seis campos** con `name` = las claves del `FormData` de §0. Los tres obligatorios llevan
  `required`/`aria-required` y marca visible. Los tres opcionales no.
- **Validación previa con `createCustomerSchema`** del barrel (R26): en `onSubmit` se hace
  `safeParse` del `FormData`. Si falla, `preventDefault()` y se pintan los `issues` junto a su campo
  (`customer-error-<campo>`), sin invocar la acción. Los largos salen del esquema. El `maxLength` del
  control usa las constantes `CUSTOMER_*_MAX_LENGTH` importadas, nunca números a mano.
- **Sin formato** (R26, QC-154 R17): correo `type="text"` con `inputMode="email"` y teléfono
  `type="text"` con `inputMode="tel"`. **Nunca `type="email"`** (el navegador bloquearía el envío de un
  texto sin `@`) y nunca `pattern`. Un test afirma los dos atributos.
- **Edición (R27):** precarga con `defaultValue` desde la **fila** (`CustomerView`), que ya trae los
  seis datos. Un opcional `null` se pinta vacío y, si sigue vacío, viaja `''`, que el esquema convierte
  en ausencia: reemplazo completo.
- **Errores por `code` (R28):**

| `code` | Dónde |
| --- | --- |
| `invalid_input` | junto al campo si el esquema de cliente ya lo identificó; si no, región `role="alert"` `customer-form-error` |
| `customer_not_found` | región del formulario (el cliente ya no existe); el panel no se cierra |
| `unauthorized`, `unexpected` y cualquier otro | región del formulario |

  El panel no se cierra y lo escrito sigue ahí (el formulario no se remonta en error).
- **Duplicados (R29):** no hay ningún código de duplicado que traducir, porque el módulo no lo tiene. La
  pantalla no consulta nada antes de guardar.
- **Éxito (R30):** cerrar, `toast.success(...)` de `sonner` sobre el `<Toaster />` del layout (no se
  monta otro) y `router.refresh()`. **Sin `revalidatePath`**: exigiría abrir el adaptador driving de
  `clientes`, que R35 prohíbe (mismo criterio que QC-44 y QC-67).

---

## 7. Baja (R31–R33)

`DeleteCustomerDialog`, copia de `delete-unit-dialog.tsx`: `AlertDialog` con el nombre completo
(`firstNames lastNames`) en `delete-customer-message` y el aviso de irreversibilidad. El formulario
interno usa `useActionState(deleteCustomerAction, { status: 'idle' })` con `<input type="hidden"
name="id">`. La acción solo se invoca al enviar el formulario del botón de confirmar (R31). En error,
el código va a `delete-customer-error` **dentro** del diálogo, que sigue abierto (R32). En éxito, R30.
Ningún control de «ver dados de baja» ni de restaurar (R33): la lista blanca tampoco lo permitiría.

---

## 8. Estructura y convenciones

- Barrel `components/index.ts` sin `'use client'`. Cada nombre se publica desde el archivo que lo
  declara. La página solo importa del barrel (R36).
- `customer-labels.ts` reexporta `CUSTOMERS_LABEL` de `private-nav.ts` (título, metadata y enlace
  del menú son el mismo dato, como `unit-labels.ts`) y declara `CUSTOMER_TABLE_TEXTS`.
- Los comentarios de producción siguen `docs/conventions.md`: cortos y sin citar fichas.
- Multiplataforma (R39): sin `100vh`, controles con `min-h-11 min-w-11`, campos con `text-base`,
  validado con `tests/helpers/viewport.ts` en angosto y ancho.

---

## 9. Modelo de datos, RLS y migraciones

**NO APLICA, y se declara.** Ninguna migración, ningún cambio de `db/schema.prisma`, ninguna tabla ni
política RLS nueva. `customers` es de QC-153, con sus columnas normalizadas de QC-154, RLS forzada y
`down.sql`. La pantalla solo lee y escribe por las Server Actions. **No se espera ninguna migración**:
si durante la implementación apareciera la necesidad, es señal de parar y avisar (R35).

---

## 10. Tests heredados que se tocan

| Archivo | Cambio | Tipo |
| --- | --- | --- |
| `tests/unit/navegacion/private-layout-menu.test.tsx` | `nav-clientes` en `testId`, en el ancla exacta y en orden (último) y en el caso «todos los permisos». Casos nuevos: Administrador lo ve; Operador no | **tensar** |
| `tests/unit/shared/data-table-alcance.test.ts` | novena pantalla consumidora (`app/(private)/clientes/`) y `e2e/clientes.spec.ts` en la lista de E2E que localizan la tabla, con su comentario «AMPLIADO … QC-155» | **tensar** (alta en lista cerrada) |
| `tests/guards/guard-identificador-de-request.test.ts` | `'clientes.spec.ts'` en `E2E_ESPERADOS`, con el párrafo de siempre («NO ejercita el cruce borde → acción…») | **tensar** |
| `tests/unit/clientes/scope.test.ts` — R26 (QC-153)/R35 (QC-154) | `permisoPermitidoEn` admite además **exactamente** `app/(private)/clientes/page.tsx` y `lib/shared/navigation/private-nav.ts`. Nuevo caso de sensibilidad: el literal en otro archivo de `app/(private)/clientes/components/` **sí** dispara | **sustituir por versión acotada** (R37) |
| `scope.test.ts` — R28 | «ningún E2E de clientes» pasa a «el **único** E2E que nombra clientes es `e2e/clientes.spec.ts`» (nombre y contenido); un fabricado `e2e/otro-clientes.spec.ts` dispara | ídem |
| `scope.test.ts` — R38 (QC-154) | «nada en `app/` nombra clientes» pasa a «solo bajo `app/(private)/clientes/`»; el fabricado `__sensibilidad_clientes__/page.tsx` **sigue** disparando | ídem |
| `tests/unit/configuracion-ui/private-nav-usuarios.test.ts` | **ninguno** con la posición por defecto («Cadena»). Solo si P2 se resuelve en «Operación», el caso «usuarios es el último de Operación» se reescribe | condicional |

Los casos sustituidos conservan en su nombre el `R<n>` de QC-153/154 y **añaden** el de QC-155 (p. ej.
`R38 (QC-154), R37 (QC-155) — …`), para que la trazabilidad de las tres fichas siga apuntando a un test
vivo.

**No se tocan:** `guard-pantallas-exigen-permiso`, `guard-rutas-privadas-cubiertas`,
`guard-nav-permisos-declarados`, `guard-nav-serializable` y `guard-e2e-landing`. Barren solos y deben
quedar verdes. `guard-dependencias-aprobadas` cierra la parte de dependencias de R35.

### 10.1 Tests nuevos (unitarios)

Carpeta `tests/unit/clientes-ui/`, calcada de `tests/unit/configuracion-ui/`:

| Archivo | Requisitos |
| --- | --- |
| `customers-route-contract.test.ts` | R1, R2: la página existe en la ruta **derivada** de `CUSTOMERS_ROUTE`; el prefijo está en la lista; ningún archivo de la ruta contiene el literal `'/clientes'` |
| `private-nav-clientes.test.ts` | R4, R6: forma del ítem, sección, icono con fila en `NAV_ICONS`, permiso leído de `page.tsx`, filtrado con los tres roles del seed, nada serializado del ítem para el Operador, `firstVisibleNavHref` sin cambios para los tres roles |
| `clientes-page.test.tsx` | R3, R5, R6, R8: orden corte → `searchParams`; sin sesión, login; sin permiso, `notFound`; `canModify` true/false decide si hay disparador, acciones de fila y sheet; ninguna escritura con los permisos del Operador |
| `customer-list-params.test.ts` | R12–R17: acotado, orden solo de la lista blanca, `city` y fechas, `parse(build(p)) = p`, término y filtro reinician la página |
| `customer-columns.test.tsx` | R10, R11, R14: columnas exactas, ninguna prohibida, ordenables = lista blanca, filtros = lista blanca, marcador de ausencia |
| `customer-list-section.test.tsx` | R7, R19, R20, R22: despacho de los cinco casos de §5.1, una sola llamada a la acción, vacío sin disparador si `!canModify` |
| `customer-table.test.tsx` | R9, R12, R13, R18, R21, R23: cada gesto navega a `customerListHref`, nada se filtra en cliente, `aria-busy` sin desmontar, eco de la propia caja no remonta (foco), cambio externo de `search` sí remonta con el término nuevo, limpiar, scroll contenido |
| `customer-form.test.tsx` | R25–R29: seis campos exactos, obligatorios marcados, esquema del contrato (largo máximo acepta, +1 rechaza sin llamar a la acción), `type`/`pattern` de correo y teléfono, precarga y reemplazo completo, errores por `code`, sin advertencia de duplicado |
| `customer-sheet.test.tsx` | R24, R30: panel lateral (no dialog centrado), éxito cierra + toast + `router.refresh`, sin segundo `Toaster` |
| `delete-customer-dialog.test.tsx` | R31–R33: nombra al cliente, no invoca sin confirmar, error dentro y abierto |
| `clientes-convenciones.test.ts` | R34–R40 por fuente: acciones por ruta exacta, sin `fetch`, sin `lib/composition` ni Prisma en componentes de cliente, sin `100vh`, barrel, sin `pedidos`, sin texto de copy en asserts, `components/ui` sin cambios |
| `data-table-intacta-clientes.test.ts` | R9: `origin/dev...HEAD` no toca `components/shared/data-table/` (copia de `data-table-intacta-usuarios.test.ts`) |
| `clientes-viewport.test.tsx` | R39: angosto y ancho con `tests/helpers/viewport.ts` |

---

## 11. E2E (R41, R42)

`e2e/clientes.spec.ts`, calcado de `e2e/usuarios.spec.ts` y `e2e/unidades.spec.ts`:

- **Fixtures por base, sin red externa:** empresa propia por worker, un usuario con el rol
  **Administrador** y otro con **Operador** del seed (`ROLE_ADMINISTRADOR`, `ROLE_OPERADOR` y
  `createPasswordHash` importados, como usuarios). Si el seed falta, el `beforeAll` falla diciéndolo.
  Prefijo `qc155_e2e_` + `RUN_ID`. Limpieza de huérfanos por prefijo **y edad** (1 h). `afterAll`
  borra por ids exactos en orden de FK (`customers` de la empresa → usuarios → empresa) y cuenta que
  no quedó nada.
- **Entrada con `loginAndLand`** (`e2e/helpers/landing.ts`), nunca un `login()` local ni una espera de
  URL fija (`guard-e2e-landing`). Navegación a la pantalla con `page.goto(CUSTOMERS_ROUTE)`, derivada de
  la constante.
- **Recorrido 1 (R41), Administrador:** `nav-clientes` visible en la barra lateral → `goto` → título y
  tabla (`data-table`) → `customer-create-open` → rellenar los tres obligatorios con `RUN_ID` (y un
  apellido **con tilde**) → guardar → la fila aparece, localizada por `data-table-cell-lastNames` con el
  texto del fixture → buscar el apellido **sin tilde** en la caja (ejercita la búsqueda real de QC-154
  a través de la pantalla) → una sola fila → editar ciudad → la celda cambia → dar de baja,
  confirmar → la fila desaparece y la búsqueda muestra `customer-list-no-matches`.
- **Recorrido 2 (R42), Operador:** `nav-clientes` con `toHaveCount(0)` → `page.goto(CUSTOMERS_ROUTE)`
  responde **404** → `not-found` visible, sin palabras que delaten el módulo (`FORBIDDEN_404_WORDS` como
  usuarios) → `clientes-title`, `data-table`, `customer-list-empty` y `customer-create-open` con
  `toHaveCount(0)`.
- `data-testid` como constantes locales (el spec corre en Node; no se importan módulos `'use client'`).
  Ningún assert sobre copy.
- **Se corre con `pnpm exec playwright test e2e/clientes.spec.ts`**, no con `pnpm run e2e -- <archivo>`.
  Chromium y WebKit.

---

## 12. Cómo se verifica, base de datos y riesgos

- **Base propia `QuimiCloude_QC155`** para el E2E (y para cualquier integración, aunque no se espera
  ninguna): `DATABASE_URL` y `DIRECT_URL` se sobrescriben **en el entorno del comando**, nunca en el
  `.env` compartido. Antes necesita `db:migrate` (incluidas `20260924120000_customers` y la de búsqueda
  normalizada de QC-154) y `db:seed`, con la salida en la bitácora.
- `./init.sh --rapido` por tanda y `./init.sh` completo al cerrar y antes del PR.

**Riesgos**

1. **La guardia de rutas privadas y `scope.test.ts` R38 se ponen rojos** en cuanto nace el primer
   archivo en `app/(private)/clientes/`. Por eso T1 (constante, prefijo, menú y la sustitución acotada
   de los tres casos de `scope.test.ts`) va antes que cualquier componente.
2. **`data-table-alcance` se pone rojo** en cuanto `customer-table.tsx` importa la tabla compartida:
   la alta en su lista cerrada va en la misma task.
3. **Segunda copia de la sincronización de la caja** (§5.3). Deuda anotada: cuando haya ficha para
   tocar la tabla compartida, las dos copias (pedidos y clientes) suben a ella.
4. **Conflictos en archivos compartidos** con otras fichas en vuelo: `private-nav.ts`, `nav-icons.ts`,
   `routes.ts`, `private-layout-menu.test.tsx`, `data-table-alcance.test.ts` y `E2E_ESPERADOS`. Son
   altas al final de listas y el conflicto sería trivial. Lo vigila el leader.
5. **`bind` del `id` en la edición.** Si no encajara con la firma real, se para y se avisa: la salida no
   es tocar `customer-actions.ts`.

---

## 13. Dependencias de terceros

**Ninguna nueva, y ninguna propuesta.** Se usa lo instalado y registrado en `docs/dependencias.md`:
shadcn/ui (`sheet`, `alert-dialog`, `button`, `input`, `label`, `skeleton`, `sonner`, ya en
`components/ui/`), `lucide-react` (`Contact`), `zod` vía el esquema del contrato, Vitest y Playwright.
Los cuatro checks no llegan a evaluarse. No entra `react-hook-form` (QC-22 P2, cerrada) ni ninguna
librería de validación de correo o teléfono (R26). Si hiciera falta una primitiva, se añade por CLI y se
compara `package.json` antes y después. Si el CLI añade una entrada, se para.

---

## 14. Alternativas descartadas

**A — `<Suspense key={query}>` como unidades y usuarios.** Es lo más simple, y sincroniza la caja con
«Atrás» gratis, porque todo se remonta. **Descartada:** remontar en cada cambio **quita el foco** a
mitad de palabra, con 300 ms de debounce. En una pantalla cuya operación principal es buscar, eso es
inutilizable. Pedidos ya abandonó ese patrón el 2026-09-07 por lo mismo (`pedidos/page.tsx:40-43`).

**B — Precargar la edición con `getCustomerAction`**, como usuarios con `getUserAction`. Sería una
lectura fresca. **Descartada:** usuarios la necesita porque su `UserRow` no trae los nueve campos.
Aquí la fila **ya es** el `CustomerView` completo del mismo render, y pedirlo otra vez es un viaje y un
estado de carga más en el panel sin dato nuevo. Si el cliente fue dado de baja entre medias, el guardado
responde `customer_not_found` y R28 lo pinta.

**C — Cortar la página por los dos permisos**, como unidades (`consultar` + `modificar`). **Descartada:**
la decisión 3 separa «ver» de «modificar» y QC-74 dice que no se implican. Cortar por los dos cerraría la
pantalla a quien solo puede ver. Es el mismo razonamiento que dejó escrito usuarios (`page.tsx:88-95`).

**D — Página de detalle `/clientes/[id]`**, como proveedores. **Descartada:** proveedores la necesita
para su catálogo paginado. El cliente son seis campos sin hijos (QC-156 aún no existe), y todo cabe en
la fila y en el panel lateral que el alcance pide.

**E — Normalizar el término (quitar acentos) en el cliente antes de enviarlo.** **Descartada:** sería
una segunda definición de «mismo texto» fuera de `normalizeCustomerText`, libre de divergir. El módulo
ya normaliza en el servidor (QC-154 R41), y la pantalla envía lo escrito (R12).

**F — Subir la sincronización de la caja a `components/shared/data-table`.** Es lo correcto con dos
consumidores. **Descartada en esta ficha:** R9 y `data-table-alcance` prohíben modificar la tabla
compartida desde una pantalla, y afectaría a las otras ocho. Queda como deuda con nombre (§12, riesgo 3).

**G — Ítem en «Operación»**, junto a Pedidos, pensando en QC-156. **No es la posición por defecto** (P2):
obliga a reescribir el caso «usuarios es el último de Operación» y adelanta un vínculo con pedidos que
la decisión 6 deja fuera. Si el humano la elige, es una línea y ese test.

**H — Validar formato de correo con `type="email"`.** **Descartada:** contradice QC-154 R17. El servidor
aceptaría lo que el navegador bloquearía.
