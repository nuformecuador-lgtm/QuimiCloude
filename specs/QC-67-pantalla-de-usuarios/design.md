# QC-67 — pantalla-de-usuarios · design.md

> Decisiones técnicas de la pantalla de administración de usuarios. El QUÉ está en
> `requirements.md`; el bloque de Alcance y la tabla de decisiones cerradas los fijó el humano el
> 2026-09-11 y aquí no se reabren.
>
> **Resumen en una línea:** es la **tercera** pantalla de la sección Configuración y clona el
> esqueleto de QC-39/QC-45 (ruta → prefijo privado → ítem de menú → página con corte por permiso →
> sección servidor que pide datos → tabla compartida → panel lateral + diálogos), con **dos
> diferencias reales**: el corte por permiso es **doble y asimétrico** (la página exige
> `usuarios.consultar`, las escrituras se ocultan sin `usuarios.modificar`) y la **edición necesita
> una segunda lectura** porque la fila del listado no trae los nueve campos editables.

## 0. Estado real del repo (verificado en el worktree, no supuesto)

Lo que ya existe y **no se construye aquí**:

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Seis Server Actions de usuarios | `lib/modules/identity/adapters/driving/user-actions.ts` | QC-66, mergeado |
| Consulta de roles | `lib/modules/identity/adapters/driving/role-actions.ts` | QC-94, mergeado |
| `UserRow`, `UserDetail`, `USER_QUERYABLE`, `Page`, errores con `code` | `lib/modules/identity/index.ts` | QC-66/QC-57 |
| `USER_ACCOUNT_STATUSES`, `DOCUMENT_TYPE_CODES` | contrato de `identity` | QC-65 / QC-4 |
| `requirePagePermission(code)` | `lib/modules/identity/adapters/driving/require-page-permission.ts` | QC-75 |
| Tabla compartida con filtros `select` multivalor | `components/shared/data-table/` | QC-55 + QC-35 |
| `PAGE_SIZE_OPTIONS` (10/25), `DEFAULT_PAGE_SIZE` | `lib/shared/pagination.ts` | QC-22 |
| Sección «Configuración» con dos ítems | `lib/shared/navigation/private-nav.ts` | QC-45 + QC-39 |
| `<Toaster />`, sidebar, `SidebarInset` | `app/(private)/layout.tsx` | QC-11 |
| `UnexpectedErrorNotice` | `components/shared/unexpected-error-notice.tsx` | QC-71 |

Dos avisos que el propio backend dejó escritos y que este diseño respeta al pie de la letra:

1. Un archivo `'use server'` **solo puede exportar funciones async**: `user-actions.ts` y
   `role-actions.ts` **no exportan** ningún `INITIAL_STATE`. El literal `{ status: 'idle' }` lo
   construye esta pantalla (R36), igual que ya hacen `unit-form.tsx` y `order-form.tsx`.
2. Las actions se importan **por su ruta exacta**, jamás desde `@/lib/modules/identity`: meter
   `'use server'` en el cierre transitivo del contrato lo haría inimportable desde un componente de
   cliente, y `guard-arquitectura-modulos.test.ts` lo vigila.

## 1. Archivos: qué se crea y qué se toca

**Se crean** (todos nuevos, ninguno compartido con otra feature en vuelo):

```
app/(private)/configuracion/usuarios/
  page.tsx                        # corte por permiso + parámetros + <Suspense>
  components/
    index.ts                      # barrel de la ruta (R38)
    user-labels.ts                # etiquetas y textos de la tabla, sin JSX
    user-list-params.ts           # parser/serializador puros de la URL (R12–R17)
    user-list-section.tsx         # Server Component async: pide datos y despacha estados
    user-list-empty.tsx           # estado vacío (R18)
    user-list-error.tsx           # estado de error (R19)
    user-list-skeleton.tsx        # estado cargando (R19)
    user-columns.tsx              # declaración de columnas (R10, R13, R14)
    user-table.tsx                # 'use client': <DataTable> + navegación por URL
    user-row-actions.tsx          # 'use client': editar / borrar / cambiar estado (R6)
    user-sheet.tsx                # 'use client': panel lateral, alta y edición (R22)
    user-form.tsx                 # 'use client': los nueve campos (R23–R27)
    delete-user-dialog.tsx        # 'use client': confirmación de borrado (R30, R31)
    user-status-dialog.tsx        # 'use client': cambio de estado (R32–R34)
e2e/usuarios.spec.ts              # R42
tests/unit/configuracion-ui/user-*.test.ts(x)   # misma carpeta que sus dos hermanas
tests/unit/configuracion-ui/usuarios-*.test.ts(x)
```

**Se tocan, y solo estos tres archivos ajenos** (R39):

- `lib/shared/routes.ts` → `USERS_ROUTE = '/configuracion/usuarios'` y su fila en
  `PRIVATE_ROUTE_PREFIXES`. Las dos cosas **entran juntas**: `guard-rutas-privadas-cubiertas`
  compara prefijos contra carpetas con `page.tsx` bajo `app/(private)/` y se pone roja en los dos
  sentidos.
- `lib/shared/navigation/private-nav.ts` → `USERS_LABEL` y el **tercer** ítem de
  `NAV_SECTION_CONFIGURATION`, al final del array, sin tocar los dos existentes.
- `progress/impl_QC-67-pantalla-de-usuarios.md` → el mapa `R<n> -> test`.

**No se toca**: `lib/modules/identity/**`, `db/schema.prisma`, `db/migrations/**`,
`components/shared/data-table/**`, `package.json` (R37).

## 2. Modelo de datos, RLS y migraciones

**Ninguno.** Esta ficha **no crea ni modifica tablas, columnas, índices, enums, políticas de RLS ni
migraciones**. Las tablas que consume (`users`, `roles`) son de `identity`, están exentas de columna
de empresa por `docs/architecture.md > Dominio` n.º 1 (`users` lleva `company_id` como columna de su
ficha desde QC-47) y ya tienen su RLS y su `FORCE ROW LEVEL SECURITY` desde QC-66. La sección
correspondiente de `docs/checkpoints-proyecto.md > Datos y seguridad` se cumple por vacío: no hay tabla nueva.

El **aislamiento por empresa** ya lo aplica el puerto de QC-66 (toda consulta está acotada a la
empresa del actor) y por eso `companyId` no viaja en `UserRow` ni en `UserDetail`. Esta pantalla **no
puede** pedir otra empresa: no hay parámetro por el que hacerlo.

## 3. Rutas y protección (R1, R3, R4, R5, R6)

```ts
// lib/shared/routes.ts
export const USERS_ROUTE = '/configuracion/usuarios';
export const PRIVATE_ROUTE_PREFIXES = [ /* … */ UNITS_ROUTE, USERS_ROUTE ] as const;
```

`page.tsx`, en este orden exacto:

```tsx
export default async function UsuariosPage({ searchParams }: { searchParams: Promise<UserListSearchParams> }) {
  await requirePagePermission('usuarios.consultar');        // R4 — antes de mirar la URL
  const canModify = await hasModifyPermission();            // R6 — decisión de PRESENTACIÓN
  const params = parseUserListParams(await searchParams);   // R17
  …
}
```

**Los dos cortes son distintos y ninguno sustituye al otro** (decisión cerrada 13):

- `PRIVATE_ROUTE_PREFIXES` cubre la URL en el **borde** → garantiza **sesión**. No conoce permisos y
  no va a conocerlos (`guard-middleware-edge`).
- `requirePagePermission('usuarios.consultar')` exige el **permiso** dentro → 404 dentro del layout
  privado si falta, indistinguible de una ruta inexistente.

**Por qué aquí el corte de página es UNO y no dos**, apartándose de QC-39: QC-74 decidió que
`modificar` **no** implica `consultar`, y QC-66 creó el par justamente para que se pudiera consultar
sin poder escribir. Cortar la página también por `usuarios.modificar` cerraría la pantalla a quien
tiene exactamente el permiso que la lista exige. Se aparta también de QC-45 (que cortó con
`.modificar`) porque allí no existía el par.

**Cómo se obtiene `canModify`.** La página es Server Component y `app/**` puede importar
`lib/composition`: `const user = await identity.getSessionUser()` y
`assertPermission(user, 'usuarios.modificar', () => …)` — es decir, **la misma única implementación
de «el actor tiene este permiso»** de QC-74, nunca un `permissions.includes(...)` escrito a mano.
Baja a los componentes de cliente como un `boolean` por props (R8). Dos consecuencias que el diseño
acepta a propósito:

- El booleano decide **qué se emite en el HTML**, no qué se puede hacer. Quien autoriza es el
  service (`requirePermission` es la primera línea de los seis casos de uso). R6 lo dice con esas
  palabras para que el reviewer pueda exigir las dos mitades.
- Los permisos de la sesión son una foto del login y envejecen hasta 8 h
  (`docs/architecture.md > Permisos`): una pantalla puede ofrecer un botón que el service ya
  deniega. El error se pinta como cualquier otro (R7). La invalidación inmediata es QC-23.

**Ítem de menú**: `permission: 'usuarios.consultar'`, el mismo código que la página. Aquí **no
aplica la excepción de QC-45** (que declaró `inventario.modificar` para que el Operador no viera un
enlace que rebota): con `usuarios.consultar` el enlace y el 404 coinciden exactamente, así que nadie
ve un enlace que le daría 404. Tampoco hace falta el test de coherencia de QC-39 R11 —allí la
pantalla exigía **dos** permisos y el ítem declaraba uno—; aquí ítem y página exigen **el mismo**,
y eso lo afirma un test de la navegación que compara la constante contra el argumento de la página.

## 4. Contratos de entrada/salida

### 4.1 Lo que la pantalla consume

| Operación | Firma | Uso |
| --- | --- | --- |
| `listUsersAction(query: unknown)` | → `{ status:'success'; data: Page<UserRow> } \| ErrorState` | la lista (R9–R21) |
| `getUserAction(id: string)` | → `{ status:'success'; data: UserDetail } \| ErrorState` | precarga de la edición (R26) |
| `createUserAction(prev, formData)` | → `{status:'idle'}\|{status:'success';id}\|ErrorState` | alta (R23, R28) |
| `updateUserAction(id, prev, formData)` | → `{status:'idle'}\|{status:'success'}\|ErrorState` | edición (R26) |
| `deleteUserAction(prev, formData)` | `id` como campo oculto | borrado (R30) |
| `setUserAccountStatusAction(prev, formData)` | `id` + `accountStatus` en el formulario | estado (R32) |
| `listRolesAction()` | → `{ status:'success'; data: readonly RoleOption[] } \| ErrorState` | selector de rol (R24) |

`DataTableParams` es **campo a campo** la misma forma que `ListQuery` (page, pageSize, sort,
filters, search), y `createListQuerySchema()` es un `z.strictObject`: los parámetros se pasan
**enteros y sin traducir** a `listUsersAction`. Traducir aquí solo podría introducir una clave de
más. Es exactamente lo que ya hacen unidades, pedidos e inventario.

### 4.2 Lo que NO sale hacia el cliente (R35)

`UserRow` (6 claves) y `UserDetail` (15 claves) **no tienen** `passwordHash`,
`mustChangeCredential`, `failedLoginAttempts`, `lockLevel`, `lockedUntil`, `companyId`, `deletedAt`
ni `accountStatusChangedBy`. Lo impide el **tipo**, no una promesa, y el `select` de Prisma enumera
columnas. Esta pantalla **no añade ningún campo** al formulario: `createUserSchema` es
`strictObject`, así que una clave de más no se ignoraría, fallaría con `invalid_input`. El test de
R35 afirma sobre las **claves exactas** que viajan a los componentes de cliente y que el
`FormData` construido contiene exactamente los nueve nombres.

## 5. Parámetros de lista: viven en la URL

`user-list-params.ts` es la hermana de `order-list-params.ts` (que es el precedente con filtro
`select` multivalor) y de `unit-list-params.ts` (que es el precedente con búsqueda). Funciones
**puras**: sin DOM, sin React, sin `next/*`, testeables sin montar la pantalla.

```
?page=2&pageSize=25&sort=lastNames:asc&status=pending,blocked&q=lopez
```

- `page`, `pageSize`, `sort`, `q`: idénticos a unidades. `pageSize` se valida contra
  `PAGE_SIZE_OPTIONS`, `sort.columnId` contra **`USER_QUERYABLE.sortable` importado**, no una copia.
- `status`: lista separada por comas; cada valor se valida contra **`USER_ACCOUNT_STATUSES`
  importado**; los desconocidos **se descartan uno a uno** y una lista que queda vacía es «sin
  filtro» (R17). Mismo criterio que `parseSelectFilter` de pedidos.
- `parse(build(p)) === p`, y `userListHref` deriva de `USERS_ROUTE` (R1): ningún literal de URL.

**Por qué en la URL y no en estado de React**: cerrar el panel lateral tiene que devolver a la lista
con los mismos parámetros (R22) sin guardarlos en ningún sitio, y recargar o compartir el enlace
conserva página, filtro y búsqueda. Es la decisión ya tomada en las cinco pantallas de lista.

## 6. La sección: lecturas, estados y el reparto

`user-list-section.tsx` es un **Server Component `async`** envuelto en `<Suspense key={query}>`
desde la página (la `key` es lo que hace reaparecer el esqueleto en cada cambio, R19).

Hace **dos lecturas en `Promise.all`**:

1. `listUsersAction(params)` → la página que se pinta. **Decide el estado de la pantalla** (R19).
2. `listRolesAction()` → el catálogo de roles para el selector del panel (R24). Es corto y cerrado.

**Degradado declarado**: si la segunda falla, la lista **se pinta igual**; lo que se propaga es el
`ErrorState` de roles hacia el panel, que lo presenta y no ofrece opciones inventadas (R24). Una
lista visible vale más que un error total por no poder rellenar un `<select>`. Es el mismo criterio
que QC-39 aplicó a su índice de unidades base.

Los tres estados se pintan **fuera** de `<DataTable>` (la tabla recibe siempre `status: 'idle'`),
igual que en unidades y presentaciones: la sección pide los datos, los componentes los pintan.

**Refresco tras mutar (R29)**: `router.refresh()` desde el cliente, que reejecuta el Server
Component con la **misma URL** —así no se pierde ningún parámetro—. **No se añade `revalidatePath`
a las actions**: la decisión cerrada 12 dice que quien decide qué se revalida es esta ficha, y esta
ficha decide **no tocar `user-actions.ts`** (R37). `revalidatePath` obligaría a que el módulo
conociera la URL de una pantalla, que es precisamente lo que QC-66 evitó.

## 7. Columnas (R10, R13, R14)

| id | Etiqueta | `sortable` | `filter` | Contenido |
| --- | --- | --- | --- | --- |
| `displayName` | Nombre | — (ver nota) | — | `row.displayName` |
| `username` | Usuario | sí | — | `row.username` |
| `email` | Correo | sí | — | `row.email` |
| `roleName` | Rol | — | — | `row.roleName` |
| `accountStatus` | Estado | sí | `select` multivalor | etiqueta del estado **almacenado** (R20) |
| `actions` | — | — | — | `<UserRowActions>`, `pinnable: false` |

Notas que evitan un error fácil:

- **`displayName` no es ordenable y `roleName` tampoco**: `USER_QUERYABLE.sortable` declara
  `lastNames`, `firstNames`, `username`, `email`, `accountStatus`, `createdAt`. El nombre mostrable
  es una **composición** (`buildDisplayName`) y el rol no está en la lista. Ofrecer un orden que el
  dominio descartaría en silencio (QC-57 R5) sería una caja que miente. **No se amplía la lista
  blanca** (R15).
- El orden por defecto (`lastNames ASC, firstNames ASC, id ASC`) lo pone el adaptador driven; la
  pantalla no lo reproduce.
- Las **etiquetas de los cuatro estados** viven en `user-labels.ts`, en un
  `Record<UserAccountStatus, string>` **tipado con la unión cerrada**: añadir un quinto estado al
  dominio rompería el typecheck aquí en vez de pintar un hueco. Las opciones del filtro se generan
  recorriendo `USER_ACCOUNT_STATUSES`, no una segunda lista.
- La columna de acciones es una **columna normal con `pinnable: false`**, el patrón que QC-45 fijó
  y QC-39 heredó. No se añade nada a la tabla compartida (R9).

> **Enmienda 2026-10-08 (QC-177 D4).** La celda de correo puede recortarse con puntos suspensivos
> (`overflow-hidden text-ellipsis`): es el contrato por defecto de la tabla compartida para una
> columna sin `hideText`, que entró en `3018853a` fuera del flujo y el humano aceptó. El correo
> completo sigue en el DOM de la celda; el truncado es solo visual. R21 (desbordamiento contenido
> en la tabla, sin scroll del documento, celda dentro del desplazador y visible) no cambia.

## 8. Alta y edición (R22–R28)

**Panel lateral** (`sheet`), un solo componente para los dos modos, exactamente como `unit-sheet`:
sin `open` trae su disparador y es el alta; con `open`/`onOpenChange` es controlado y es la edición
desde la fila. El contenido se monta solo al abrir, así que cada apertura arranca limpia.

**Los nueve campos** (R23), con los nombres de `FormData` que lee `userCandidateFromFormData`:
`firstNames`, `lastNames`, `birthDate`, `email`, `phone`, `documentTypeCode`, `documentNumber`,
`username`, `roleId`. Se exportan como una constante `USER_BUSINESS_FIELDS` para que el test afirme
sobre ella y no sobre literales.

- **Sin campos de más**: ni empresa, ni contraseña, ni estado de cuenta. `strictObject` los
  rechazaría, y ese rechazo es el test de R23/R35.
- **Los campos viajan tal cual**, sin `trim` ni normalización en el cliente: `createUserSchema` ya
  hace `trim().min(1)`, y repetirlo aquí sería una segunda copia de una regla de negocio.
  A diferencia de unidades, aquí **los nueve son obligatorios**, así que no existe el problema de
  «ausente vs vacío» que obligó a `buildUnitFormData`: el `FormData` se envía directo.
- `birthDate` → `<input type="date">`, que emite `YYYY-MM-DD`, que es lo que `z.iso.date()` espera.
  En la **edición**, `UserDetail.birthDate` es un `Date` y se formatea a `YYYY-MM-DD` con una
  función pura de `user-labels.ts`, **en UTC** para que un huso negativo no reste un día. El propio
  `user-view.ts` dice que esa conversión es de la pantalla.
- `documentTypeCode` → `<select>` sobre `DOCUMENT_TYPE_CODES` del contrato (R25).
- `roleId` → `<select>` sobre `RoleOption[]` de QC-94 (R24).

**La edición precarga con `getUserAction(id)`** (R26). La fila trae seis claves y el formulario
necesita nueve: no hay forma de editar sin una segunda lectura. Se dispara **al abrir el panel**,
desde el cliente (una Server Action se puede invocar desde un componente de cliente), con tres
estados dentro del panel: cargando, error y formulario. La edición es **reemplazo completo** de los
nueve, nunca parcial.

**Errores por `code` estable** (R27), mapa tipado con `ErrorCode` como en `unit-form.tsx`:

| `code` | Dónde se pinta |
| --- | --- |
| `duplicate_email` | junto al correo |
| `duplicate_username` | junto al nombre de usuario |
| `duplicate_document` | junto al número de documento |
| `role_not_found` | junto al selector de rol |
| `invalid_input`, `self_operation`, `last_administrator`, `user_not_found`, `unauthorized` | región `role="alert"` del formulario |
| `unexpected` | `UnexpectedErrorNotice`, que añade el identificador de petición (QC-71) |

Un rechazo **no cierra el panel y no pierde lo escrito**. El mapa está tipado con `ErrorCode`: un
código mal escrito o retirado del catálogo rompe el typecheck en vez de caer callado al mensaje
genérico.

**Toast neutro tras el alta** (R28): «Usuario creado.» y nada más. La cuenta nace `pending` y nadie
puede entrar hasta QC-79; anunciar un enlace que todavía no existe sería inventar (regla 6).
`createUserAction` devuelve el `id` creado: esta pantalla **lo ignora** —no hay página de detalle a
la que navegar—, y eso se dice aquí para que no parezca un olvido.

## 9. Borrado y cambio de estado (R30–R34)

**Borrado**: diálogo de confirmación que **nombra al usuario** por su `displayName` y advierte que
no se puede deshacer. El `id` viaja como campo oculto, que es lo que `readTargetId` espera. El error
se pinta **dentro del diálogo**, por su código, sin retirar la fila: aquí los casos vivos son
`self_operation` (es tu propia ficha) y `last_administrator` (dejaría a la empresa sin
administrador). El diálogo se monta solo mientras está abierto, así que un rechazo anterior no
reaparece.

**Cambio de estado**: **una sola** acción de fila, «Cambiar estado», con un selector de los cuatro
valores y confirmación antes de escribir (R32). La pantalla **no traduce estados a verbos**
(«Activar», «Bloquear»…) y **no decide qué transiciones ofrecer**: `setAccountStatusSchema` admite
los cuatro como destino desde cualquier otro porque en esta feature no hay transiciones prohibidas,
y escribir esa tabla en la UI sería regla de negocio en el sitio equivocado.

**`blocked` → `active` se ofrece desde el primer día** (R34). Hoy **no** limpia el bloqueo ni el
contador de intentos fallidos: eso es R45 de QC-66 cambiando por QC-95, y QC-95 **no bloquea** a
esta ficha. La pantalla no promete nada al respecto y no compensa la diferencia.

**El desfase conocido de R20**, escrito con nombre: una cuenta `blocked` cuyo plazo ya venció se
pinta `blocked` mientras el login la deja entrar. Es la dirección segura (muestra más bloqueado de
lo que está) y **no se tapa con lógica en la UI**: `UserRow` no trae `lockedUntil` a propósito.

## 10. Dependencias de terceros

**Ninguna nueva** (R37, decisión cerrada 14). Todo lo que hace falta —`sheet`, `select`, `dialog`,
`input`, `label`, `button`, `sonner`, la tabla compartida— está instalado y aprobado en
`docs/dependencias.md`. No hay, por tanto, ningún bloque de «cuatro checks» que rellenar: no se
propone ninguna librería. Si durante la implementación apareciera la tentación de una (por ejemplo
para formatear fechas), el implementer **para y la propone**; no la instala.

## 11. Multiplataforma (R40)

Sin excepción de escritorio. Objetivos táctiles `min-h-11 min-w-11`, campos con `text-base` en
**todos** los anchos (el primitivo baja a 14 px en `md` y iOS hace zoom por debajo de 16 px),
`pb-[env(safe-area-inset-bottom)]` en el panel, acciones de fila **siempre en el DOM** y nunca
detrás de `:hover` ni de un desplegable. El desbordamiento de la tabla —seis columnas, la de correo
es la que más pide— se resuelve con scroll **contenido en la tabla**, nunca del `body`. Se valida
con `tests/helpers/viewport.ts` en angosto y ancho.

## 12. Alternativas descartadas (y por qué)

**A. Cortar la página con los DOS permisos, como QC-39.** Sería copiar el precedente sin pensarlo.
QC-74 decidió que `modificar` no implica `consultar` y QC-66 creó el par para que existiera el
lector sin escritura; exigir los dos en la página anularía ese caso el mismo día que nace.
Descartada: la asimetría es el punto de la decisión cerrada 3.

**B. Precargar los `UserDetail` de toda la página en la sección**, para que la edición abra sin
segunda lectura. Descartada: son 10 o 25 fichas de 15 campos cada una bajando al cliente para que
se use, como mucho, **una**; y todas ellas quedarían en el payload del HTML. La lectura perezosa al
abrir el panel mueve exactamente un registro y solo cuando hace falta. Coste aceptado: un instante
de «cargando» dentro del panel, que R26 exige presentar.

**C. Una acción de fila por transición** («Activar», «Desactivar», «Bloquear»). Es más bonita de
usar y **mete regla de negocio en la UI**: la pantalla tendría que saber qué transiciones son
legales desde cada estado, una tabla que hoy no existe en ningún sitio —el dominio admite los
cuatro desde cualquiera— y que divergiría del día en que el dominio la tuviera. Descartada por la
decisión cerrada 4.

**D. Calcular el estado efectivo leyendo `lockedUntil`** para no pintar `blocked` una cuenta ya
liberada. Descartada: `UserRow` no lo trae **a propósito** (QC-66 R45), traerlo obligaría a tocar el
módulo (R37), y el cálculo sería una segunda definición de «¿esta cuenta puede entrar?» conviviendo
con la de QC-78. Se prefiere el desfase en la dirección segura, anotado como deuda con nombre.

**E. Importar las actions desde `@/lib/modules/identity`.** Descartada por imposible: metería
`'use server'` en el cierre transitivo del contrato y lo haría inimportable desde cualquier
componente de cliente. Lo dicen los dos archivos de actions y lo vigila la guardia de arquitectura.

**F. Filtrar la lista en el cliente sobre la página visible** (búsqueda y estado). Descartada:
filtraría 10 filas de N, así que mentiría en cuanto hubiera una segunda página. El módulo ya busca y
filtra en la base con su lista blanca.

**G. Guardar los parámetros de lista en estado de React.** Descartada: cerrar el panel, recargar o
compartir el enlace perderían página, filtro y orden, que es justo lo que R22 exige conservar.

**H. Añadir filtro por rol**, que «sale gratis». Descartada: `USER_QUERYABLE.filterable` declara
solo `accountStatus`, la decisión cerrada 10 enumera búsqueda y filtro por estado **y nada más**, y
R15 prohíbe ampliar la lista blanca. Si algún día se quiere, es una línea en `user-queryable.ts` y
su ficha.

**I. Añadir `revalidatePath(USERS_ROUTE)` a las actions de QC-66.** Descartada: obligaría a que el
módulo conociera la URL de una pantalla y tocaría un archivo que R37 declara intocable.
`router.refresh()` consigue lo mismo sin invertir la flecha.

## 13. Riesgos y cómo se mitigan

| Riesgo | Mitigación |
| --- | --- |
| El ítem de menú y la página divergen en el permiso | Test que compara la constante del ítem con el código que exige `page.tsx`; ambos derivan del mismo literal del catálogo tipado |
| La ruta entra sin su prefijo privado | `guard-rutas-privadas-cubiertas` se pone roja en los dos sentidos; T2 mete las dos cosas en el mismo commit |
| Alguien «mejora» el formulario con validación de correo o `toLowerCase` en el usuario | `user-input.ts` lo prohíbe por escrito (reabriría QC-47 por la puerta de atrás); test que afirma que el `FormData` viaja sin transformar |
| `canModify` se confunde con autorización | R6 lo dice, el comentario del componente lo dice, y el test de permisos afirma **las dos** mitades: la UI oculta y el service rechaza |
| Un quinto estado de cuenta deja huecos en la tabla | El mapa de etiquetas está tipado `Record<UserAccountStatus, string>`: rompe el typecheck |
