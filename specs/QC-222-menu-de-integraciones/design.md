# QC-222 — menu-de-integraciones · design.md

> Zona: `frontend` · Complejidad: `low` · depends_on: QC-221 · Rama:
> `feature/QC-222-menu-de-integraciones`
>
> El **qué** está en `requirements.md` (R1–R22). Aquí va el **cómo**. Estos son los precedentes
> directos:
>
> - **QC-221** (`specs/QC-221-permiso-y-modulo-de-integraciones/design.md > 4` y `> 8.1`, en `dev`
>   desde el PR #176, merge `57fa8326`): dejó para esta ficha las tres piezas de protección y las
>   enmiendas a sus R9 y R15.
> - **QC-75**: el `NavGroup` sin permiso propio y el corte por permiso en cada `page.tsx`.
> - **QC-93**: el aterrizaje derivado con `e2e/helpers/landing.ts`.
> - **Clientes y usuarios**: cómo se da de alta un item del menú con su pantalla, su fila de prefijo
>   y su test que lee el permiso de la fuente de `page.tsx` (`tests/unit/clientes-ui/private-nav-clientes.test.ts`).
>
> **Regla transversal.** Manda `docs/conventions.md > Comentarios`. Ningún comentario nuevo de
> producción ni de test cita `QC-<n>`, `R<n>`, `design.md` ni «decisión cerrada». En los tests,
> `R<n>` va en el **nombre del caso**.

---

## Lo que ya existe

Busqué los términos `integraciones`, `integración`, `whatsapp`, `proveedor-ia`/«proveedor IA»,
`menu`/`sidebar` y «estado vacío»/`empty` en tres sitios:

- `feature_list.json`, por `name` y `description`;
- `specs/`, con grep;
- el código, con el grafo (`search_graph` «integraciones whatsapp proveedor ia empty state
  placeholder») y con grep sobre `app/`, `components/`, `lib/`, `e2e/` y `specs/` de este
  worktree.

| Apareció | Qué es | Qué se hace |
|---|---|---|
| QC-221 `permiso-y-modulo-de-integraciones` (PR #176, en `dev`, merge `57fa8326`) | Crea el permiso `integraciones.modificar`, el módulo vacío y las tres constantes de ruta. Su §4 deja para esta ficha la página, el prefijo y el enlace | **Se reutiliza entero**: es la dependencia. No se re-crea ni el permiso ni las constantes |
| QC-119 `webhook-whatsapp-recepcion` (`cancelled`) | Endpoint que recibe mensajes de WhatsApp | Nada que reutilizar. No se solapa |
| QC-11, QC-40 y QC-75 (`done`) | El sidebar, el `NavGroup` con `Collapsible` y el filtrado por permiso | **Se reutilizan sin tocarlos** (R7). El grupo nuevo es un dato más en `PRIVATE_NAV_ITEMS` |
| QC-93 (`done`) | `e2e/helpers/landing.ts` (`loginAndLand`) y `guard-e2e-landing` | La E2E entra por `loginAndLand` (R21) |
| `app/(private)/*/components/*-empty.tsx` (trece, por ejemplo `proveedores/components/supplier-list-empty.tsx`) y `components/shared/data-table/data-table-states.tsx > DataTableEmpty` | Estados vacíos **por pantalla** o **de tabla**, todos con el mismo marcado: `div` de borde discontinuo y un `<p>` atenuado. No hay un componente de estado vacío compartido | Los componentes son de su dominio y no se importan, pero **se reutiliza su patrón de marcado** tal cual (§4.2, D11). No se añade la primitiva `empty` de shadcn |
| Código de este worktree | Ningún símbolo, ruta, página ni enlace `integraciones` | — |

Conclusión: no existe nada de esta ficha fuera de su dependencia, QC-221.

---

## 0. Hallazgos al leer el código

1. **El menú es un dato.** `PRIVATE_NAV_ITEMS` (`lib/shared/navigation/private-nav.ts:252-422`)
   tiene diez items. `AppSidebar` lo recorre y dibuja un `NavGroup` como `Collapsible` inline en
   modo expandido (`components/private/app-sidebar.tsx:302-343`) o como menú flotante en modo
   icono (`:352-386`). En los dos casos los hijos llevan su `testId` y **no dibujan icono**. Añadir
   un grupo no exige tocar el componente.
2. **El `NavGroup` no lleva permiso** (`private-nav.ts:231-248`). `filterNavItemsByPermissions`
   (`:475-496`) lo quita entero si no le queda ningún hijo visible.
3. **El aterrizaje sigue el orden del array.** `firstVisibleNavHref` (`:509-518`) devuelve el
   primer enlace visible, y lo usan el login y `e2e/helpers/landing.ts`. Un item **al final** del
   array no cambia el aterrizaje de nadie que ya vea otro enlace. El Administrador ve antes
   «Asignación». El Maestro no ve ningún enlace hoy: aterriza en el 404 privado (QC-161 D18), y
   sigue sin ver el grupo.
4. **`NavIconName` y `NAV_ICONS` van atados.** El `Record` de `nav-icons.ts` obliga a que un
   nombre nuevo tenga su fila; si falta, no compila.
5. **El corte de página** es `requirePagePermission(code: PermissionCode)`
   (`lib/modules/identity/adapters/driving/require-page-permission.ts:48-56`):
   - sin sesión, `redirect(LOGIN_ROUTE_SESSION_ENDED)`;
   - sin el permiso, `notFound()`.

   El parámetro es la unión de literales del catálogo; `'integraciones.modificar'` está en él
   desde QC-221.
6. **`guard-rutas-privadas-cubiertas` muerde en los dos sentidos** (`:132-161`): toda pantalla
   necesita un prefijo, y todo prefijo necesita alguna pantalla debajo. Se salta las carpetas
   `components/` (`NON_ROUTE_DIRS`). Una carpeta `app/(private)/integraciones/` **sin**
   `page.tsx` propia no produce ruta.
7. **Precedente de componentes compartidos entre rutas hermanas**:
   `app/(private)/produccion/formulas/nueva/page.tsx` y `[id]/page.tsx` importan de
   `'../components'`.
8. **QC-221 deja tests que esta ficha tiene que enmendar.** Llegaron a `dev` con ella (las líneas
   se leyeron en su rama y se vuelven a medir en T0):
   - `tests/unit/integraciones/integration-routes.test.ts:138-151`, R14: afirma que
     `/integraciones/inventarios` sin sesión da `allow` con los prefijos reales, y eso deja de ser
     cierto en cuanto la ruta entra en la lista;
   - `tests/unit/integraciones/integration-routes.test.ts:154-186`, R15: afirma que no hay prefijo,
     ni enlace, ni página;
   - `tests/unit/integraciones/module-shape.test.ts:196-215`, R9: afirma que el código solo está
     en el catálogo y en las migraciones, y usa como ejemplos negativos justo
     `app/(private)/integraciones/whatsapp/page.tsx` y `lib/shared/navigation/private-nav.ts`.
9. **El comentario de `lib/shared/routes.ts` sobre las tres constantes** (QC-221) dice «aún fuera
   de `PRIVATE_ROUTE_PREFIXES`». Deja de ser cierto y se borra.
10. **Tests que fijan la forma del menú y se pondrán rojos** (§7.2): la longitud y el orden de
    `PRIVATE_NAV_ITEMS`, «clientes es el último del array» y «Configuración tiene exactamente dos
    items».
11. **El Maestro no tiene empresa**, y QC-161 exige que solo un Maestro tenga la empresa vacía
    (`specs/QC-161-rol-maestro/requirements.md:277`). Ningún E2E de hoy crea un Maestro. Por eso
    queda fuera de la E2E (D12).
12. **El patrón de estado vacío del repo** es el mismo `div` en las trece pantallas que lo tienen.
    Su forma canónica, sin acciones, es `app/(private)/proveedores/components/supplier-list-empty.tsx:11-15`:
    `div` con `data-testid` propio y
    `flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center`, y dentro un
    `<p className="text-sm text-muted-foreground">` con el texto. La repiten, por ejemplo,
    `app/(private)/configuracion/unidades/components/unit-list-empty.tsx:44-52` y
    `app/(private)/clientes/components/customer-list-empty.tsx`.

---

## 1. Qué cambia (resumen)

| Pieza | Cambio |
|---|---|
| `lib/shared/navigation/private-nav.ts` | Cuatro etiquetas nuevas y el `NavGroup` «Integraciones» como **último** item del array. `NavIconName` suma `'puzzle'` |
| `lib/shared/navigation/nav-icons.ts` | La fila `puzzle: Puzzle` |
| `lib/shared/routes.ts` | Las tres constantes entran en `PRIVATE_ROUTE_PREFIXES`. Se borra el comentario de QC-221 que decía lo contrario |
| `app/(private)/integraciones/components/` | `integration-placeholder.tsx` y su `index.ts` |
| `app/(private)/integraciones/{proveedor-ia,inventarios,whatsapp}/page.tsx` | Tres páginas cascarón |
| Tests | Los nuevos de §7.1, los rojos de §7.2 y las enmiendas a QC-221 de §7.3 |
| `e2e/integraciones.spec.ts` | Nuevo (§8) |

**No se tocan**:

- `components/private/app-sidebar.tsx`;
- `components/ui/`: no se añade ninguna primitiva (D11);
- los tipos y las funciones de `private-nav.ts`: solo se añade el dato;
- `lib/modules/**`, `lib/composition/**`, `db/**`, `middleware.ts` y `route-guard-middleware.ts`;
- `package.json`;
- `e2e/permisos.spec.ts` y `e2e/helpers/landing.ts`.

---

## 2. Modelo de datos, migraciones y RLS

**Ninguno.** Esta ficha no crea tablas, columnas, migraciones ni policies, y no lee datos (R10,
R22). El permiso y su asignación al Administrador llegan con la migración y el seed de QC-221.

---

## 3. El grupo del menú

### 3.1 Etiquetas

En `private-nav.ts`, junto a las demás `*_LABEL`:

```ts
export const INTEGRATIONS_LABEL = 'Integraciones';
export const AI_PROVIDER_INTEGRATION_LABEL = 'Proveedor IA';
export const INVENTORY_INTEGRATION_LABEL = 'Inventarios';
export const WHATSAPP_INTEGRATION_LABEL = 'WhatsApp';
```

Son la **única copia** de cada texto. El título de cada página sale de la misma constante, sin
prefijo (D13), igual que `UNITS_LABEL`. Los tests afirman sobre las constantes, nunca sobre
el literal.

### 3.2 El grupo

Va como **último** elemento de `PRIVATE_NAV_ITEMS`, detrás de clientes:

```ts
{
  kind: 'group',
  label: INTEGRATIONS_LABEL,
  testId: 'nav-integraciones',
  icon: 'puzzle',
  section: NAV_SECTION_CONFIGURATION,
  items: [
    { kind: 'link', href: AI_PROVIDER_INTEGRATION_ROUTE, label: AI_PROVIDER_INTEGRATION_LABEL,
      testId: 'nav-integraciones-proveedor-ia', permission: 'integraciones.modificar' },
    { kind: 'link', href: INVENTORY_INTEGRATION_ROUTE, label: INVENTORY_INTEGRATION_LABEL,
      testId: 'nav-integraciones-inventarios', permission: 'integraciones.modificar' },
    { kind: 'link', href: WHATSAPP_INTEGRATION_ROUTE, label: WHATSAPP_INTEGRATION_LABEL,
      testId: 'nav-integraciones-whatsapp', permission: 'integraciones.modificar' },
  ],
},
```

- **Al final del array**: así no cambia el aterrizaje de nadie (hallazgo 3, R6) ni la posición de
  ningún item previo. `groupNavItemsBySection` lo dibuja dentro de «Configuración», detrás de
  «Unidades», porque agrupa por orden de aparición.
- **Sección «Configuración»** (D8). Hoy solo la ve el Administrador:
  `inventario.modificar` y `unidades.consultar` no los tiene otro rol de semilla. Así el grupo no
  abre un encabezado nuevo para nadie.
- **`testId`**: siguen la forma de `nav-produccion` / `nav-produccion-recetas`.
- **Los hijos sin `icon`**: el componente no los dibuja (hallazgo 1). El tipo lo admite, pero
  ponerlo sería un dato muerto.
- **Sin `permission` en el grupo**: el tipo no lo admite, y QC-75 lo prohíbe.
- **`permission: 'integraciones.modificar'`** es el **mismo** código que exige cada página (R2).
  Tiene una sola acción, así que no hay la tensión de QC-39 entre `consultar` y `modificar`. Que
  item y página digan lo mismo lo vigila el test de §7.1, que **lee** el código de la fuente de
  cada `page.tsx`.

### 3.3 El icono

`NavIconName` suma `'puzzle'` y `NAV_ICONS` suma `puzzle: Puzzle`, importado de `lucide-react`
(D9). `lucide-react` ya está instalado (`package.json`; la versión del lockfile, 1.53.0, trae
`Puzzle`): **no hay dependencia nueva**. Sigue
siendo una cadena, así que `guard-nav-serializable` no cambia.

---

## 4. Las páginas cascarón

### 4.1 Rutas y archivos

```
app/(private)/integraciones/
  components/
    index.ts                       ← export { IntegrationPlaceholder } from './integration-placeholder';
    integration-placeholder.tsx
  proveedor-ia/page.tsx
  inventarios/page.tsx
  whatsapp/page.tsx
```

- **Sin `page.tsx` en `/integraciones`.** El tramo intermedio no tiene pantalla, como
  `/configuracion`. Pedir `/integraciones` da el 404 de Next, igual que hoy.
- **`components/` en la carpeta padre**, compartida por las tres hermanas, con el patrón de
  `produccion/formulas` (hallazgo 7). Las páginas importan del barrel: `from '../components'`. La
  carpeta no produce ruta (hallazgo 6).

### 4.2 `IntegrationPlaceholder`

Es un Server Component sin estado y sin `'use client'`. Recibe `title: string` y dibuja dos cosas:

- un `<h1 data-testid="integration-title">` con `title`;
- el estado vacío `data-testid="integration-empty"`, con el texto de D10: «Próximamente podrás
  configurar esta integración.». El texto vive en una constante exportada del componente,
  `INTEGRATION_EMPTY_MESSAGE`, que es su única copia y sobre la que afirman los tests.

No tiene botón, enlace, formulario ni campo (R10).

**La pieza del estado vacío** (D11). Se reutiliza el patrón que ya usa el repo (hallazgo 12), sin
primitiva nueva:

```tsx
<div
  data-testid="integration-empty"
  className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center"
>
  <p className="text-sm text-muted-foreground">{INTEGRATION_EMPTY_MESSAGE}</p>
</div>
```

Es el marcado de `app/(private)/proveedores/components/supplier-list-empty.tsx:11-15`, sin el slot
`children`, porque aquí no hay acción que ofrecer. No se importa `SupplierListEmpty`: es del
dominio de proveedores y trae su propio texto y su `testId`.

El contenedor exterior es un `div` con `flex flex-1 flex-col gap-4 p-4 md:p-6`, como
`clientes/page.tsx`. **No** es `<main>`: ese papel ya lo hace `SidebarInset`.

### 4.3 Cada `page.tsx`

Las tres tienen la misma forma. Solo cambian la etiqueta y el nombre de la función:

```tsx
import type { Metadata } from 'next';

import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';
import { AI_PROVIDER_INTEGRATION_LABEL, BRAND_LABEL } from '@/lib/shared/navigation/private-nav';

import { IntegrationPlaceholder } from '../components';

export const metadata: Metadata = {
  title: `${AI_PROVIDER_INTEGRATION_LABEL} · ${BRAND_LABEL}`,
};

export default async function AiProviderIntegrationPage() {
  await requirePagePermission('integraciones.modificar');

  return <IntegrationPlaceholder title={AI_PROVIDER_INTEGRATION_LABEL} />;
}
```

- **El corte es la primera instrucción** y exige un solo código (R11). Sin sesión, redirige al
  login; sin el permiso, `notFound()` y 404 dentro del layout privado (R12): es el
  `private-not-found` de QC-75, que QC-93 ya comprueba.
- **No recibe `params` ni `searchParams`, y no llama a ninguna action ni a ningún caso de uso**
  (R10). El único import de `lib/modules/` es el adaptador `driving` de `identity`, igual que en
  las demás páginas.
- **Sin literal de URL** (R18): la página no necesita su ruta, porque su ubicación la materializa
  la carpeta.
- **Sin comentarios.** El porqué está aquí.

---

## 5. Las rutas en los prefijos privados

En `lib/shared/routes.ts`, **al final** de `PRIVATE_ROUTE_PREFIXES`, detrás de `CUSTOMERS_ROUTE`:

```ts
  AI_PROVIDER_INTEGRATION_ROUTE,
  INVENTORY_INTEGRATION_ROUTE,
  WHATSAPP_INTEGRATION_ROUTE,
] as const;
```

- **Una fila por ruta**, no una sola `/integraciones` (alternativa 1 de §10). Es el mismo criterio
  de `/configuracion/*`.
- **Se borra** el comentario de dos líneas que QC-221 dejó sobre las tres constantes (hallazgo 9).
  Las filas nuevas no llevan comentario: la JSDoc de la lista ya dice para qué sirve cada entrada.
- **Corte por sesión (R13).** Sin sesión, el borde redirige al login, porque la ruta cae bajo su
  propio prefijo. **Corte por permiso (R12)**: lo hace la página. **El middleware no cambia**: no
  decide por permiso (QC-75 R16, R18).
- **`/integraciones/inventarios` no cae bajo `/inventario`** (R15): `isUnderPrefix` compara por
  segmentos. Ahora que la ruta está en la lista, el test lo prueba con una lista **sin** las tres
  rutas, donde la decisión tiene que seguir siendo `allow` (§7.3).

Con esto, `guard-rutas-privadas-cubiertas` (tres pantallas, tres prefijos),
`guard-pantallas-exigen-permiso` (el código está en el catálogo) y `guard-nav-permisos-declarados`
(los tres hijos declaran un código del catálogo) quedan en verde **sin excepciones** (R14).

---

## 6. Contratos de entrada y salida

| Superficie | Entrada | Salida |
|---|---|---|
| `GET /integraciones/{proveedor-ia,inventarios,whatsapp}` sin sesión | — | Redirección del middleware al login (R13) |
| Lo mismo, con sesión **sin** el permiso | — | 404 con `private-not-found` dentro del layout privado (R12) |
| Lo mismo, con sesión **con** el permiso | — | 200: `integration-title` con la etiqueta y `integration-empty` con el texto (R9) |
| `layout` privado → `AppSidebar` | `filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, permisos)` | Con el permiso: el grupo y sus tres hijos. Sin él: nada del grupo (R4, R5) |

No hay Server Actions, route handlers ni integraciones externas.

---

## 7. Tests

### 7.1 Nuevos

| Archivo | Proyecto | Cubre |
|---|---|---|
| `tests/unit/integraciones-ui/private-nav-integraciones.test.ts` | unit | **R1**: un solo `NavGroup` con `INTEGRATIONS_LABEL`; hijos exactos (`href`, `label` por constante, `testId`) y en orden; ningún otro destino bajo `/integraciones`. **R2**: cada hijo declara el código que **lee** de la fuente de la `page.tsx` de su `href` (ruta derivada de la constante, como `private-nav-clientes`); un solo `requirePagePermission` por página. **R3**: `icon` con fila en `NAV_ICONS`, `NAV_ICONS[icon]` es `Puzzle` de `lucide-react`, y `section` = `NAV_SECTION_CONFIGURATION`. **R4**: con los permisos del Administrador (`SEED_ROLE_PERMISSIONS`) aparece el grupo con los tres hijos. **R5**: para **cada** rol de semilla sin el permiso (derivados del conjunto, con un ancla que exige que sean ≥ 1 y que el Administrador sí lo tenga), el filtrado no deja el grupo y `JSON.stringify` del resultado no contiene ni etiquetas, ni destinos, ni `testId` del grupo. **R6**: `firstVisibleNavHref` con y sin el grupo es igual para cada rol de semilla, y `PRIVATE_NAV_ITEMS` sin el grupo es igual, elemento a elemento, a los diez items previos (por `testId` y `section`) |
| `tests/unit/integraciones-ui/integration-pages.test.tsx` | ui | Para cada una de las tres páginas, con `@/lib/composition` (`identity.getSessionUser`) y `next/navigation` (`notFound`, `redirect`) simulados y lanzando, como en `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`. **R9**: con una sesión que trae el permiso, el árbol renderizado tiene `integration-title`, cuyo texto es exactamente la etiqueta del hijo cuyo `href` es esa ruta, e `integration-empty` cuyo texto es exactamente `INTEGRATION_EMPTY_MESSAGE`; un caso aparte ancla esa constante al literal «Próximamente podrás configurar esta integración.». **R10**: el render no tiene `form`, `input`, `select`, `textarea` ni `button`; por fuente, la página no declara `params` ni `searchParams`, y sus imports son exactamente `next` (tipo), el adaptador `require-page-permission`, `private-nav` y `'../components'`. **R11**: por fuente, sin comentarios, hay exactamente un `requirePagePermission('integraciones.modificar')` y es la primera sentencia del cuerpo. **R12**: con sesión sin el permiso, `notFound` se llama y no se renderiza nada. **R13** (parte de página): sin sesión, `redirect` se llama con `LOGIN_ROUTE_SESSION_ENDED` |

### 7.2 Tests que hoy fijan la forma del menú y se ponen rojos

Las líneas son de este worktree, y el implementer las vuelve a localizar contra `dev` tras
sincronizar. **Se tensan, nunca se relajan**: siguen exigiendo la lista exacta.

| Archivo:línea | Qué fija | Cambio |
|---|---|---|
| `tests/unit/app-sidebar.test.tsx:560-572` | `PRIVATE_NAV_ITEMS` tiene **10** items, con estos `testId` y en este orden | **11**, con `'nav-integraciones'` al final |
| `tests/unit/clientes-ui/private-nav-clientes.test.ts:89-91` | Clientes es el **último** item del array | Pasa a decir: clientes es el **penúltimo**, y el último es el grupo `nav-integraciones`. Sigue fijando la posición exacta |
| `tests/unit/configuracion-ui/private-nav-configuracion.test.ts:76` | «Configuración» tiene **2** items, y el primero es presentaciones | **3**. El primero sigue siendo presentaciones |
| `tests/unit/configuracion-ui/private-nav-usuarios.test.ts:102` y `:108-111` | «Configuración» tiene **2** items, en el orden `[PRESENTATIONS_ROUTE, UNITS_ROUTE]` | **3**, en el orden `[PRESENTATIONS_ROUTE, UNITS_ROUTE, INTEGRATIONS_LABEL]`. El mapeo de ese test ya devuelve `label` para los grupos |

**No se ponen rojos**, porque derivan del dato o miran otra cosa:

- `guard-nav-permisos-declarados`, `guard-nav-serializable`, `guard-pantallas-exigen-permiso` y
  `guard-rutas-privadas-cubiertas`;
- `tests/unit/navegacion/nav-filtrado.test.ts`, que usa fixtures;
- `sidebar-desktop`/`sidebar-mobile`/`app-sidebar`: buscan el **primer** grupo, que sigue siendo
  `nav-produccion`;
- `private-nav-configuracion > ningún item de la sección apunta a una ruta sin page.tsx`: las tres
  páginas existen;
- `e2e/permisos.spec.ts`: el Operador no ve el grupo, y su lista de ocultos no necesita nombrarlo
  para seguir siendo cierta.

### 7.3 Enmiendas a los tests de QC-221

| Archivo (llegó a `dev` con QC-221) | Requisito | Cambio |
|---|---|---|
| `tests/unit/integraciones/integration-routes.test.ts` R14, `:138-151` | **R15** | La decisión del borde se prueba con `PRIVATE_ROUTE_PREFIXES` **sin** las tres rutas: `/integraciones/inventarios` sin sesión da `allow`, y `/inventario` da `redirect`. Así se sigue probando que la comparación es por segmentos. El caso pasa a llamarse con R15 de esta ficha |
| `tests/unit/integraciones/integration-routes.test.ts` R15, `:154-186` | **R13, R14, R16, R8** | El bloque se **invierte**: «las rutas de integraciones tienen pantalla». (a) Los prefijos bajo `/integraciones` son exactamente las tres constantes, y `/integraciones` no está. (b) Los `href` bajo `/integraciones` de los enlaces aplanados son exactamente las tres constantes. (c) Las páginas bajo `app/` cuya URL empieza por `integraciones` son exactamente las tres, por sus segmentos. (d) R13: `decideRouteAccess` con los prefijos reales y sin sesión da `redirect` para cada una de las tres. Se borra `AVISO_DE_ENMIENDA` |
| `tests/unit/integraciones/module-shape.test.ts` R9, `:196-215` | **R17** | `isAllowedHolderOfTheCode` admite además las **cuatro rutas exactas**: las tres `page.tsx` y `lib/shared/navigation/private-nav.ts`. Los ejemplos negativos pasan a ser `app/(private)/integraciones/components/integration-placeholder.tsx` y `lib/shared/routes.ts`. Se añade un caso: el barrido ve el código en las cuatro rutas nuevas (anticegado). El mensaje de fallo deja de nombrar QC-222 |

**R18** lo sigue cubriendo el R14 de QC-221 sin cambios: `filesContaining(url)` debe seguir dando
solo `lib/shared/routes.ts` para cada URL.

### 7.4 Verificación en revisión, sin test nuevo

- **R7 y R22**: el diff no toca `components/private/app-sidebar.tsx`, `components/ui/**`,
  `lib/modules/**`, `lib/composition/**`, `db/**`, `middleware.ts` ni `route-guard-middleware.ts`, y en
  `private-nav.ts` solo añade constantes, el nombre de icono y el item. La lista exacta está en
  `tasks.md > Archivos esperados`. Para `package.json` está además `guard-dependencias-aprobadas`.

---

## 8. La E2E: `e2e/integraciones.spec.ts`

Es la E2E que QC-221 difirió (su D5). Sigue el patrón de `e2e/permisos.spec.ts` para los datos y
entra por `loginAndLand` (QC-93).

**Datos**

- Prefijos propios: `qc222_e2e_` para los usuarios y `qc222_e2e_empresa_` para las empresas.
- `RUN_ID` por proceso de worker.
- Una empresa efímera por worker, con `normalizeCompanyName`.
- Hash real con `createPasswordHash` y `accountStatus: 'active'`.
- Limpieza defensiva **por edad**, de una hora: Chromium y WebKit corren a la vez.
- `afterAll` borra por prefijo de `RUN_ID`, primero los usuarios y luego la empresa.
- Los roles son los **reales del seed**, buscados por las constantes `ROLE_*` del barrel de
  `identity`; nunca se crean ni se borran. Si falta uno, se falla nombrando el seed.

**Qué roles (R21)**

- **Con el permiso:** las claves de `SEED_ROLE_PERMISSIONS` cuyo conjunto contiene
  `integraciones.modificar`. Un ancla exige que sea exactamente `[ROLE_ADMINISTRADOR]`: si cambia,
  la E2E se pone roja con un mensaje que lo dice.
- **Sin el permiso:** el resto **menos `ROLE_MAESTRO`**, que se excluye por nombre, con su motivo
  escrito: la empresa vacía es única (hallazgo 11, D12). Hoy son Operador, Empacador
  y Administrador de acondicionamiento. Que el Maestro no vea el grupo lo cubre R5 en unit.

**Casos**

1. **Administrador (R19).** Pasos:
   - `loginAndLand`;
   - `nav-integraciones` visible y clic, que despliega el `Collapsible` (el viewport por defecto es
     de escritorio, con el sidebar expandido);
   - los tres hijos visibles;
   - para cada hijo, en el orden de R1: clic, `waitForURL` a su constante, `integration-title` con
     su etiqueta (`toHaveText` sobre la constante) e `integration-empty` visible;
   - por último, `page.goto` de cada constante y `response.status() === 200`.
2. **Un caso por cada rol sin el permiso (R20).** Pasos:
   - `loginAndLand`;
   - `toHaveCount(0)` sobre `nav-integraciones` y sobre los tres `testId` de los hijos;
   - para cada constante, `page.goto` con `status() === 404` y `private-not-found` visible;
   - el texto no contiene `permiso`, `rol` ni `autoriz`;
   - `private-user-trigger` se abre por teclado (foco + `Enter`, por el overlay de `next dev` en
     WebKit que documenta `permisos.spec.ts`) y `private-logout` es visible.

`test.setTimeout(180_000)`, como `permisos.spec.ts`: compilación bajo demanda y bcrypt.

**No hace falta excepción en `guard-e2e-landing`**: no hay `login-submit` en el spec, y el único
`waitForURL` sigue a un clic de menú.

---

## 9. Multiplataforma

No hay controles nuevos:

- el disparador y los hijos del grupo son los de `AppSidebar`, ya revisados;
- las páginas no tienen campos ni botones;
- no hay `100vh`, `:hover` como única vía, ni `font-size` de input.

**No se declara ninguna excepción.**

---

## 10. Alternativas descartadas

1. **Un solo prefijo `/integraciones` en `PRIVATE_ROUTE_PREFIXES`.** La guardia lo aceptaría,
   porque cubre las tres pantallas de debajo. Pero exige una constante para el tramo, y QC-221 la
   descartó con el criterio de `/configuracion`: su test R14 fija exactamente tres constantes bajo
   `/integraciones`. Además, protegería por sesión cualquier ruta futura bajo `/integraciones` sin
   que nadie lo decida. Una fila por ruta es lo que hacen `/configuracion/*`.
2. **Una página índice en `/integraciones`** con tres tarjetas. La ficha pide tres páginas, no
   cuatro. Sería una pantalla más que proteger y probar, sin contenido.
3. **Ampliar `e2e/permisos.spec.ts`** en vez de crear un spec. Ese spec es a propósito una sola
   cadena para el Operador, y `guard-e2e-landing` lo exime por eso. Meter ahí el recorrido del
   Administrador y de otros roles mezclaría sujetos y lo haría chocar con cualquier ficha que toque
   permisos.
4. **El título y el estado vacío escritos en cada `page.tsx`.** Serían tres copias del mismo
   marcado y del mismo texto que habría que cambiar a la vez. El componente compartido en
   `../components` tiene precedente (hallazgo 7).
5. **Un `components/shared/empty-state.tsx` nuevo**, migrando a él los trece estados vacíos del
   repo. Es un refactor fuera de alcance que tocaría trece pantallas ajenas. Si lo crea solo esta
   ficha, abre un segundo patrón que nadie más usa.
6. **Dar al grupo un permiso propio**, o comprobar el permiso en `AppSidebar`. QC-75 lo prohíbe:
   son dos verdades sobre lo mismo, y filtrar en el cliente haría viajar los items ocultos en el
   payload.
7. **Cortar por permiso en el middleware.** Reabre QC-75 (R16, R18) y pone en rojo
   `guard-middleware-edge`. Ya lo descartó QC-221 (§9.1).
8. **Poner el grupo antes de otros items**, por ejemplo primero en «Configuración» o en
   «Operación». Movería posiciones fijadas por otras fichas y, en «Operación», podría cambiar el
   aterrizaje. Al final del array no cambia nada de lo que ya existe (R6).
9. **La primitiva `empty` de shadcn** (`components/ui/empty.tsx`). Fue la propuesta del borrador.
   El humano la descartó en F1.4 (D11): ninguna pantalla la usa, y meterla por una página cascarón
   abriría un segundo patrón de estado vacío junto al de las trece que ya existen.

---

## 11. Dependencias de terceros

**Ninguna nueva** (R22):

- `lucide-react` ya está (icono `Puzzle`).
- El estado vacío es marcado propio con clases de Tailwind (§4.2): no pasa por la CLI de shadcn.

No hay librería que evaluar con los cuatro checks.

---

## 12. Orden y sincronización

QC-221 ya está en `dev` (PR #176, merge `57fa8326`). En T0, antes de tocar código, la rama se sincroniza con
`git fetch origin dev && git merge origin/dev` (`docs/perfil-agentes.md > implementer`). Después
se vuelven a medir los hallazgos 1, 8 y 10 contra el árbol sincronizado: las líneas citadas aquí
se leyeron antes del merge.

---

## 13. Decisiones de F1.4 (2026-10-08)

Todas cerradas por el humano; están en `requirements.md > Decisiones cerradas` como D8–D14.

| # | Decisión | Dónde |
|---|---|---|
| D8 | Sección «Configuración», con el grupo como último item del array | §3.2 |
| D9 | Icono `puzzle` (`Puzzle` de `lucide-react`) | §3.3 |
| D10 | Texto del estado vacío: «Próximamente podrás configurar esta integración.» | §4.2 |
| D11 | Estado vacío con el patrón del repo (`supplier-list-empty.tsx:11-15`); sin primitiva `empty` | §4.2, hallazgo 12, alternativa 9 |
| D12 | La E2E excluye al Maestro y lo cubre en unit (R5) | §8 |
| D13 | Título de la página = etiqueta del hijo del menú | §3.1 |
| D14 | Permiso y constantes de QC-221 ya en `dev` con los nombres previstos | §0, §12 |

Queda como decisión técnica de este diseño, sin reabrir nada: una fila de
`PRIVATE_ROUTE_PREFIXES` por ruta (§5, alternativa 1).
