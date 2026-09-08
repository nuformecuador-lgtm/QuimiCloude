# QC-75 — menu-y-rutas-por-permiso · design.md

> Cubre `requirements.md` R1–R22. Las decisiones cerradas de la semilla no se reabren aquí: este
> documento dice **cómo** se cumplen.

## 0. Resumen en cinco líneas

1. Cada enlace de `PRIVATE_NAV_ITEMS` declara el permiso que exige; el layout privado filtra el
   array **antes** de pasárselo a `AppSidebar`, que no cambia (R1–R5).
2. Cada `page.tsx` de la zona privada abre con `await requirePagePermission('<modulo>.consultar')`,
   que redirige al login si no hay sesión y llama a `notFound()` si falta el permiso (R6, R7, R10).
3. El 404 lo pinta `app/(private)/not-found.tsx`, que Next renderiza **dentro** de
   `app/(private)/layout.tsx`: cabecera, menú filtrado y cerrar sesión siguen ahí (R8, R9, R14).
4. `loginAction` calcula su destino por defecto con el primer enlace del menú ya filtrado (R11–R13).
5. `ROUTE_ROLE_RULES`, `RouteRoleRule`, `findRouteRule` y la rama `forbidden` de `decideRouteAccess`
   se borran; el middleware conserva firma, caducidad, empresa y las dos redirecciones (R16–R18).

**Modelo de datos: ninguna tabla, ninguna migración, ningún cambio de `db/schema.prisma` ni del
seed** (R22). Esta ficha es UI + borde; el backend es QC-74 y ya está.

---

## 1. Dónde se filtra el menú (R1–R5)

### 1.1 El permiso viaja en el propio ítem

`lib/shared/navigation/private-nav.ts` gana un campo en `NavLink`:

```ts
export type NavLink = {
  readonly kind: 'link';
  readonly href: string;
  readonly label: string;
  readonly testId: string;
  /** Permiso `<modulo>.consultar` que exige este enlace (QC-75 R5). */
  readonly permission: string;
  readonly icon?: NavIconName;
  readonly section?: string;
  readonly badge?: number;
};
```

Obligatorio, no opcional: un enlace sin permiso sería un enlace que se ve siempre, y eso es el
comodín que la decisión 2 prohíbe. `NavGroup` **no** lleva permiso: un grupo se ve si le queda algún
hijo visible (decisión 4, R3), y darle uno propio crearía dos verdades sobre lo mismo.

Valores, uno por ítem actual: Dashboard `dashboard.consultar`, Inventario `inventario.consultar`,
Pedidos `pedidos.consultar`, Recetas (hijo de «Producción») `recetas.consultar`, Proveedores
`proveedores.consultar`.

**Por qué el tipo es `string` y no `PermissionCode`:** `lib/shared/**` no puede importar
`lib/modules/**` (`docs/architecture.md > La regla de dependencias`), así que el `PermissionCode` de
`identity` no llega hasta aquí. El agujero que eso deja —un código mal escrito— lo cierra una
guardia, no un comentario: `tests/guards/guard-nav-permisos-declarados.test.ts` (R20) importa
`PERMISSIONS` y `PRIVATE_NAV_ITEMS` a la vez, que es algo que solo `tests/` puede hacer, y se pone
roja si algún ítem declara un código que no está en el catálogo o si un enlace no declara ninguno.

Sigue siendo serializable (una cadena), así que `tests/guards/guard-nav-serializable.test.ts` sigue
verde por construcción.

### 1.2 Dos funciones puras, en la misma fuente

```ts
/** Los ítems visibles para ese conjunto de permisos, en el mismo orden (R1–R4). */
export function filterNavItemsByPermissions(
  items: readonly NavItem[],
  permissions: readonly string[],
): readonly NavItem[];

/** El `href` del primer enlace visible, entrando en los grupos por su orden, o `null` (R11). */
export function firstVisibleNavHref(items: readonly NavItem[]): string | null;
```

Reglas de `filterNavItemsByPermissions`:

- `kind: 'link'` → se conserva si `permissions.includes(item.permission)`.
- `kind: 'group'` → se filtran sus `items` con la misma regla; si quedan **cero**, el grupo
  desaparece entero (R3); si queda al menos uno, se devuelve el grupo con sus hijos filtrados.
- Nunca reordena ni muta: devuelve estructuras nuevas (R4). `groupNavItemsBySection` se aplica
  después, en `AppSidebar`, sin cambios.

Van en `private-nav.ts` y no en el componente porque **la fuente decide y el componente dibuja**
(decisión 7): `AppSidebar` no se toca en esta ficha, ni siquiera para leer permisos.

### 1.3 El layout filtra

`app/(private)/layout.tsx` ya resuelve la sesión en cada render y ya tiene `user.permissions`
(QC-74 R7). Una línea:

```ts
const navItems = filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions);
// ...
<AppSidebar user={user} navItems={navItems} />
```

Cero consultas nuevas (R19): el conjunto de permisos llega en la misma lectura de sesión que ya
existía.

**Consecuencia buscada de filtrar en el servidor (R2):** el HTML servido no contiene el ítem. Lo
verifica el test de la página renderizada buscando el `data-testid` del ítem oculto y afirmando
`toHaveCount(0)` / `queryByTestId(...) === null`, no una clase CSS.

---

## 2. De dónde sale el 404 (R6–R10)

### 2.1 El helper, en un adaptador driving de `identity`

Archivo nuevo: `lib/modules/identity/adapters/driving/require-page-permission.ts`.

```ts
import { notFound, redirect } from 'next/navigation';

import { identity } from '@/lib/composition';
import { assertPermission, type PermissionCode } from '@/lib/modules/identity';
import { LOGIN_ROUTE } from '@/lib/shared/routes';

export async function requirePagePermission(permission: PermissionCode): Promise<void> {
  const user = await identity.getSessionUser();
  if (user === null) redirect(LOGIN_ROUTE);
  assertPermission(user, permission, () => notFound());
}
```

Por qué así, punto por punto:

- **Es un adaptador driving**, no dominio: usa `next/navigation` y `lib/composition`, que es
  exactamente lo que la tabla de dependencias permite a `adapters/driving/**` y prohíbe a `domain/**`.
  Y `app/**` puede importar `.../adapters/driving/**`, así que las páginas lo alcanzan sin ruta
  profunda al dominio.
- **`PermissionCode`, no `string`** (R10): pedir `'inventaro.consultar'` no compila. Media clase de
  errores se convierte en rojo de `typecheck` en vez de en un 404 silencioso en producción.
- **`assertPermission` con `onDenied: () => notFound()`** (R10): `notFound()` está tipada
  `(): never` y **lanza** el error de control de Next antes de devolver nada, así que la excepción
  sale de `assertPermission` sin que este conozca a Next. Se hace así, y no con un `includes` a mano,
  porque QC-74 R12 dejó `assertPermission` como la **única** implementación de «el actor tiene este
  permiso»; una segunda comparación aquí sería una segunda definición de autorización. La sutileza
  se documenta en el archivo para que nadie la "simplifique" a un `if`.
- **`redirect` si no hay sesión**: el layout y la página se renderizan **en paralelo** en el App
  Router, así que la página no puede dar por hecho que el `redirect` del layout ya ocurrió. Es la
  misma última línea de defensa que describe `docs/architecture.md`, no una duplicación por adorno.
- **Devuelve `void`**: ninguna página de hoy usa el `SessionUser` (los casos de uso resuelven su
  propio actor). Devolverlo invitaría a pasarlo por props y a que una página lo fetchease "ya que
  está".
- **No entra en el cierre de imports del middleware** (R18): `middleware.ts` importa
  `route-guard-middleware.ts`, y ese archivo no importa este. Vivir en la misma carpeta no lo mete
  en el bundle del borde; `tests/guards/guard-middleware-edge.test.ts` recorre imports, no carpetas.

### 2.2 Las ocho páginas

Cada `page.tsx` bajo `app/(private)/` abre con una línea, antes de leer `searchParams` o de
renderizar nada:

| Página | Permiso |
| --- | --- |
| `dashboard/page.tsx` | `dashboard.consultar` |
| `inventario/page.tsx` | `inventario.consultar` |
| `pedidos/page.tsx` | `pedidos.consultar` |
| `proveedores/page.tsx` | `proveedores.consultar` |
| `proveedores/[id]/page.tsx` | `proveedores.consultar` |
| `produccion/formulas/page.tsx` | `recetas.consultar` |
| `produccion/formulas/nueva/page.tsx` | `recetas.consultar` |
| `produccion/formulas/[id]/page.tsx` | `recetas.consultar` |

**Por qué el alta y la edición piden `consultar` y no `modificar`:** el permiso de escritura ya lo
exige el caso de uso al guardar (QC-74), y QC-74 decidió por escrito que no hay implicación entre
permisos. Pedir `modificar` en la ruta sería una **segunda** regla de autorización sobre la misma
operación, en un sitio que no es la frontera —`docs/architecture.md`: «un permiso implementado solo
como corte de ruta no cuenta como implementado»—. La ruta decide si se **enseña** una pantalla; el
service decide si se puede **hacer**. Quien tenga solo `recetas.consultar` verá el formulario y el
guardado le será denegado por el service, que es donde tiene que doler.

### 2.3 El 404, dentro del layout privado

Archivo nuevo: `app/(private)/not-found.tsx`.

Mecánica de Next 16.3 (`next@16.3.0`, verificado en el paquete instalado: `notFound()` se exporta
desde `next/navigation` con firma `(): never`, y `forbidden()`/`unauthorized()` existen pero
requieren `experimental.authInterrupts`, que este repo no activa):

- `notFound()` **lanzado desde una página** lo captura el `not-found` más cercano por encima de esa
  página, y ese límite se renderiza **dentro de los layouts de su segmento y superiores**. Con el
  archivo en el route group `(private)`, el 404 sale envuelto en `app/(private)/layout.tsx`: barra
  lateral con el menú filtrado, cabecera y `NavUser` con cerrar sesión (R8, R14).
- **No se llama `notFound()` desde el layout.** Un `notFound()` lanzado en un layout hace fallar ese
  layout, así que el límite que responde es el de **arriba** y el 404 saldría pelado, sin menú ni
  botón de salir — justo lo que la decisión 3 existe para evitar. Por eso el corte va en la página
  (2.1) y no en el layout, aunque el layout ya lea la sesión.
- Status HTTP: `notFound()` responde **404** en el documento inicial. El E2E lo afirma sobre la
  respuesta real (`response.status()`), no sobre el texto.

Contenido: un título y una frase neutra («No encontramos esta página»), un enlace a la primera
pantalla disponible **no** se pinta (haría falta volver a resolver permisos y delataría cuáles hay),
y `data-testid="private-not-found"`. **No menciona permisos, ni roles, ni el módulo pedido** (R7):
quien lo lea no puede distinguir «no existe» de «no puedes».

**Límite conocido, y por qué se acepta:** una URL que no casa con **ninguna** ruta del App Router
(`/inventario/loquesea`) no llega a ninguna página, así que la resuelve el límite raíz de Next,
fuera del layout privado. Es decir: dentro del conjunto de rutas privadas declaradas, «sin permiso»
y «no existe» son indistinguibles (que es lo que R7 exige y lo que un atacante puede sondear); una
URL inventada se ve distinta. Ver la alternativa descartada nº 2.

### 2.4 Nadie con permiso cero se queda encerrado (R9)

Rol sin permisos → menú filtrado vacío → toda ruta privada devuelve 404 dentro del layout, con el
menú vacío y el botón de cerrar sesión presente. No hay pantalla de «sin acceso» y el login funciona
con normalidad: la credencial era correcta, y decir lo contrario sería mentir (decisión 1).

---

## 3. El destino del login (R11–R13)

`lib/modules/identity/adapters/driving/login-action.ts`, tras `verifyCredentials` correcto:

```ts
const user = await identity.getSessionUser();
const fallback =
  (user === null ? null : firstVisibleNavHref(filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions))) ??
  DASHBOARD_ROUTE;

const destino = resolveReturnPath(readField(formData, RETURN_PARAM), fallback);
redirect(destino);
```

- **El orden no cambia** respecto de QC-9: el destino de vuelta válido sigue mandando (R13); lo que
  cambia es el **respaldo**, que ya no es siempre el dashboard.
- **`getSessionUser()` después de `startSession`**: la cookie ya se escribió en esta misma petición y
  el almacén de cookies de Next refleja las escrituras pendientes dentro de la misma Server Action,
  así que la lectura ve la sesión recién emitida. Es una consulta extra **en el login**, una vez por
  inicio de sesión: R19 habla de no añadir consultas **por petición** en la navegación, y esto no lo
  es. La alternativa —ampliar el resultado de `verifyCredentials`— rompe un contrato congelado
  (alternativa descartada nº 3).
- **`DASHBOARD_ROUTE` como último respaldo** cubre R12 sin inventar ninguna ruta: si el menú
  filtrado está vacío, esa persona tampoco tiene `dashboard.consultar` —el dashboard es un ítem del
  menú—, así que `/dashboard` responde exactamente el 404 dentro del layout que pide la decisión 3.
  El respaldo no es un caso feliz disfrazado: es el mismo 404 de R7, alcanzado sin código nuevo.
- **`/login` con sesión viva sigue redirigiendo a `DASHBOARD_ROUTE`** desde el middleware (R17): el
  borde no conoce los permisos y no va a conocerlos (R18). Para quien no tenga `dashboard.consultar`
  eso acaba en el 404 del layout, con su menú a la izquierda para seguir. Se documenta en el propio
  middleware; resolverlo exigiría una consulta en el borde, que es precisamente lo prohibido.

---

## 4. La retirada de `ROUTE_ROLE_RULES` (R16–R18)

### 4.1 Qué se borra

| Archivo | Qué pasa |
| --- | --- |
| `lib/composition/route-role-rules.ts` | **Se borra entero.** Era la lista, y la lista es lo que se retira. |
| `lib/modules/identity/domain/route-role-rules.ts` | **Se borra entero**: `RouteRoleRule` y `findRouteRule` se quedan sin ningún consumidor. Un gancho sin lista es código muerto que invita a rellenarlo otra vez. |
| `lib/modules/identity/index.ts` | Deja de exportar `findRouteRule` y `RouteRoleRule`. |
| `lib/modules/identity/domain/route-access.ts` | `RouteAccessInput` pierde `rules`; `RouteAccessSession` pierde `roleName` (nadie lo mira ya); `RedirectReason` pierde `'forbidden'`; desaparece el paso 4 de la política y su `isAllowedByRules`. |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | Deja de importar la lista y de leer `claims.roleName`. Todo lo demás —verificación, caducidad, `PRIVATE_ROUTE_PREFIXES`, las dos redirecciones— se queda igual. |
| `middleware.ts` | **No se toca**: es un cascarón que reexporta el handler y declara el `matcher`. |

Lo que **no** cambia: la cookie sigue firmando `roleName` (QC-8/QC-9 son sus dueños y `nav-user` lo
pinta como display), `PRIVATE_ROUTE_PREFIXES` sigue siendo la declaración de qué es privado, y el
middleware sigue sin tocar la base (R18).

### 4.2 Tests y centinelas que hoy nombran la lista

Trece archivos la mencionan. Cada uno, con lo que hay que hacerle:

| Archivo | Acción |
| --- | --- |
| `tests/guards/guard-autorizacion-por-permiso.test.ts` | **Rompe si no se toca**: afirma que `lib/composition/route-role-rules.ts` menciona `ROLE_ADMINISTRADOR` y que el middleware lee `roleName`. Su propio mensaje dice «revisa si QC-75 ya se la llevó». Se retiran esas dos anclas y su prosa; el resto de la guardia (los cinco módulos de negocio) no se toca. |
| `tests/unit/identity/route-role-rules.test.ts` | Se borra: se fue lo que probaba. |
| `tests/unit/identity/route-access.test.ts` | Se quitan los casos de la rama `forbidden` y el import de la lista; se conservan y refuerzan los de anónimo→login, login con sesión y ruta pública. |
| `tests/unit/identity/route-guard-middleware.test.ts` | Igual: fuera los casos por rol, dentro un caso nuevo que afirma que **una ruta privada con sesión válida pasa sin mirar el rol** (R16). |
| `tests/unit/inventario/product-route-contract.test.ts`, `tests/unit/proveedores/supplier-route-contract.test.ts`, `tests/unit/pedidos-ui/order-route-contract.test.ts`, `tests/unit/pedidos-ui/route-role-pedidos.test.ts`, `tests/unit/recetas-ui/recipe-route-contract.test.ts` | Sustituyen la afirmación «hay una fila `{prefix, roles:[Administrador]}`» por la nueva: la pantalla exige su `<modulo>.consultar` (R6) y su ítem de menú declara ese mismo permiso (R5). El resto de cada contrato de ruta (que la constante no se redeclara, que el prefijo privado existe) se queda. |
| `tests/unit/pedidos-ui/pedidos-convenciones.test.ts`, `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts` | Solo listan la ruta del archivo como «intocable/tocable» de **su** feature. Se actualiza la lista para que no apunte a un archivo inexistente. |
| `tests/guards/guard-rol-administrador-unico.test.ts` | Solo lo nombra en un comentario; se actualiza la prosa. La guardia sigue vigilando el literal del rol y **sigue verde**: tras esta ficha el único dueño del literal es `identity/domain/roles.ts`. |
| `e2e/session.spec.ts` | Su usuario cuelga del rol `Administrador` real «porque el middleware lo exige»; ya no lo exige, pero el rol real sigue siendo lo correcto (es quien tiene `inventario.consultar` para que el paso 2 aterrice en la pantalla). Se corrige la prosa, no el fixture. |
| `docs/architecture.md > Permisos y autenticacion` | Se reescribe: el middleware valida **firma y caducidad** (esas dos palabras juntas y la frase «la autorizacion se valida en el service» **tienen que quedarse**, o `tests/guards/guard-doc-permisos.test.ts` se pone roja), ya no corta por rol, y el corte por permiso vive en la página. |

---

## 5. Guardias nuevas (R20)

Dos, ambas con el patrón de `tests/guards/guard-rutas-privadas-cubiertas.test.ts` (`findRepoRoot`,
funciones puras exportadas, casos sintéticos que demuestran que la regla dispara **y** el simétrico
que no la viola, y un ancla anti-vacuidad):

1. `tests/guards/guard-pantallas-exigen-permiso.test.ts` — barre las carpetas con `page.tsx` bajo
   `app/(private)/` y exige que cada fuente, sin comentarios, contenga una llamada a
   `requirePagePermission(` con un código del catálogo. Una pantalla nueva sin corte pone el gate en
   rojo con su nombre. Ancla: hoy tiene que encontrar las ocho.
2. `tests/guards/guard-nav-permisos-declarados.test.ts` — recorre `PRIVATE_NAV_ITEMS` (valor real,
   importado) y exige que **todo** `NavLink`, incluidos los hijos de grupo, declare un `permission`
   que esté en `PERMISSIONS`. Es lo que compensa que `lib/shared` no pueda usar `PermissionCode`.

---

## 6. Contratos de entrada/salida

No hay endpoint nuevo, ni Route Handler, ni Server Action nueva. Lo que cambia de forma:

| Símbolo | Antes | Después |
| --- | --- | --- |
| `NavLink` | sin `permission` | `permission: string` obligatorio |
| `filterNavItemsByPermissions` | — | `(items, permissions) => NavItem[]` |
| `firstVisibleNavHref` | — | `(items) => string \| null` |
| `requirePagePermission` | — | `(permission: PermissionCode) => Promise<void>` |
| `RouteAccessInput` | `{..., rules}` | sin `rules` |
| `RouteAccessSession` | `{kind:'authenticated', sub, roleName}` | `{kind:'authenticated', sub}` |
| `RedirectReason` | `'unauthenticated' \| 'already-authenticated' \| 'forbidden'` | sin `'forbidden'` |
| `loginAction` | respaldo `DASHBOARD_ROUTE` | respaldo = primer enlace visible, si no `DASHBOARD_ROUTE` |

---

## 7. Dependencias de terceros

**Ninguna** (decisión 10, R22). Todo lo que hace falta ya está: `next/navigation` para `notFound()`
y `redirect()`, `assertPermission` de QC-74 y las funciones puras nuevas, que son un `filter` y un
recorrido. No se abre ninguna fila en `docs/dependencias.md` y `guard-dependencias-aprobadas` sigue
verde sin tocarse.

---

## 8. Alternativas descartadas

1. **Filtrar el menú en `AppSidebar`, pasándole los permisos por props.** Descartada: la decisión 7
   —heredada de QC-11— dice que `PRIVATE_NAV_ITEMS` es la única fuente y que el componente solo
   recorre. Además el componente es `'use client'`: filtrar allí significa que los ítems ocultos
   **viajan en el payload** del servidor al cliente, y R2 pide justo lo contrario. Un ítem que no se
   ve pero está en el HTML es un ítem que se ve con las herramientas de desarrollo.

2. **Un catch-all `app/(private)/[...slug]/page.tsx` que llame a `notFound()`**, para que también las
   URLs privadas inventadas cayeran dentro del layout y el 404 fuera indistinguible al 100 %.
   Descartada: `(private)` es un route group y **no aparece en la URL**, así que ese catch-all
   capturaría *toda* URL no reconocida de la aplicación —también las públicas— y las metería en el
   layout privado, redirigiendo al login a cualquier visitante anónimo que se equivoque de
   dirección. El precio es mayor que la diferencia que arregla (ver 2.3).

3. **Ampliar `verifyCredentials` para que devuelva el usuario y sus permisos**, y así calcular el
   aterrizaje sin releer la sesión. Descartada por dos motivos: su resultado es un contrato
   **congelado** desde QC-7 —`{ ok: boolean }`, con un único objeto de rechazo compartido para que el
   login no sea un oráculo—, y devolver datos del usuario en el resultado del login abre la puerta a
   que un camino de fallo se lleve un campo de más. La relectura cuesta una consulta **por inicio de
   sesión**, no por petición.

4. **Una lista `ROUTE_PERMISSION_RULES` que sustituya a `ROUTE_ROLE_RULES`** (misma forma, permisos
   en vez de roles) y siga viviendo en el middleware o en `lib/composition`. Descartada: es la
   arquitectura que esta ficha viene a retirar. El middleware no puede resolver permisos sin tocar
   la base (R18), la lista se desincroniza del árbol de páginas en silencio, y el corte quedaría otra
   vez lejos del sitio donde se pintan los datos. Con la llamada en cada página, el corte está donde
   se sirve la pantalla y una guardia (R20) impide que se olvide.

5. **`forbidden()` de Next 16 con `experimental.authInterrupts`.** Descartada: la decisión cerrada es
   404, no 403 —un 403 confirma que la pantalla existe—, y además obligaría a activar una bandera
   experimental del framework para toda la aplicación.

---

## 9. Verificación (`docs/verification.md`)

- **Unit** — las dos funciones puras de navegación (orden, grupo sin hijos, menú vacío, primer
  enlace); `requirePagePermission` con sesión ausente, con permiso y sin permiso; `decideRouteAccess`
  sin reglas; el nuevo respaldo de `loginAction`; el layout privado renderizado con permisos de
  Operador (los `data-testid` ocultos no están en el árbol).
- **Guardias** — las dos nuevas (R20) más las tocadas (`guard-autorizacion-por-permiso`,
  `guard-doc-permisos`, `guard-middleware-edge` sin cambios pero tiene que seguir verde).
- **E2E** (`e2e/permisos.spec.ts`, R21) — flujo crítico «permisos» de `CHECKPOINTS.md`, el que QC-74
  difirió. Usuario efímero con prefijo propio (`qc75_e2e_`), empresa efímera propia y el rol
  **`Operador` real del seed** —igual que `e2e/session.spec.ts` usa el `Administrador` real—: los
  permisos de ese rol son el dato bajo prueba. Pasos: entra → aterriza en `/inventario` (primer ítem
  de su menú, R11) → el menú muestra `nav-inventario` y **no** `nav-dashboard`, `nav-pedidos`,
  `nav-proveedores` ni `nav-produccion` (R2, R3) → `goto('/pedidos')` responde **404** (R7) → en esa
  pantalla siguen presentes `private-not-found` y el control de cerrar sesión (R8, R14).
