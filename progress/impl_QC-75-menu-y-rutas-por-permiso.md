# QC-75 — menu-y-rutas-por-permiso · bitacora de implementacion

> Zona `fullstack` · complejidad `high` · depende de QC-74 · rama
> `feature/QC-75-menu-y-rutas-por-permiso` · worktree
> `.worktrees/QC-75-menu-y-rutas-por-permiso/`.
>
> **16 de 16 tasks en `[x]`.** Dos commits en la rama: `bb4bd5b` (tandas 1-3 + T13) y
> `a18258d` (tandas 4-5 y el arreglo que destapo el E2E).
>
> El gate completo (`./init.sh`) lo corre el leader: aqui esta lo que corri yo, con su
> salida real.

---

## 1. Que se construyo, en cinco lineas

1. Cada enlace de `PRIVATE_NAV_ITEMS` declara el permiso que exige; el layout privado filtra
   el array **en el servidor** antes de pasarselo a `AppSidebar`, que no se toco.
2. Cada `page.tsx` de la zona privada abre con `await requirePagePermission('<modulo>.consultar')`,
   que redirige al login sin sesion y llama a `notFound()` sin el permiso.
3. El 404 lo pinta `app/(private)/not-found.tsx`, que Next renderiza **dentro** de
   `app/(private)/layout.tsx`: cabecera, menu filtrado y cerrar sesion siguen ahi.
4. `loginAction` calcula su destino por defecto con el primer enlace del menu ya filtrado.
5. `ROUTE_ROLE_RULES`, `RouteRoleRule`, `findRouteRule` y la rama `forbidden` de
   `decideRouteAccess` se borraron; el middleware conserva firma, caducidad y empresa.

**Ninguna migracion, ningun cambio de `db/schema.prisma` ni del seed, ninguna dependencia nueva.**

---

## 2. Archivos

### Produccion — creados

| Archivo | Que es |
| --- | --- |
| `lib/modules/identity/adapters/driving/require-page-permission.ts` | El helper: resuelve la sesion, redirige al login si no hay y delega en `assertPermission` con `onDenied: () => notFound()` (R6, R10). |
| `app/(private)/not-found.tsx` | El 404 de la zona privada, dentro del layout privado, con copy neutro y `data-testid="private-not-found"` (R7, R8). |

### Produccion — borrados

| Archivo | Por que |
| --- | --- |
| `lib/composition/route-role-rules.ts` | Era la lista ruta a rol, y la lista es lo que se retira (R16). |
| `lib/modules/identity/domain/route-role-rules.ts` | `RouteRoleRule` y `findRouteRule` se quedaron sin ningun consumidor: un gancho sin lista es codigo muerto que invita a rellenarlo otra vez. |

### Produccion — modificados

| Archivo | Que cambio |
| --- | --- |
| `lib/shared/navigation/private-nav.ts` | `NavLink` gana `permission: string` **obligatorio**, relleno en los cinco enlaces; y dos funciones puras nuevas, `filterNavItemsByPermissions` y `firstVisibleNavHref` (R1, R3, R4, R5, R11). |
| `app/(private)/layout.tsx` | Filtra el menu con `user.permissions`, de la **misma** lectura de sesion que ya hacia (R1, R2, R19). |
| `app/(private)/dashboard/page.tsx` | `requirePagePermission('dashboard.consultar')`; pasa a `async`. |
| `app/(private)/inventario/page.tsx` | `requirePagePermission('inventario.consultar')`. |
| `app/(private)/pedidos/page.tsx` | `requirePagePermission('pedidos.consultar')`. |
| `app/(private)/proveedores/page.tsx` | `requirePagePermission('proveedores.consultar')`. |
| `app/(private)/proveedores/[id]/page.tsx` | `requirePagePermission('proveedores.consultar')`. |
| `app/(private)/produccion/formulas/page.tsx` | `requirePagePermission('recetas.consultar')`. |
| `app/(private)/produccion/formulas/nueva/page.tsx` | `requirePagePermission('recetas.consultar')` — **`consultar`, no `modificar`**: la escritura la exige el service. |
| `app/(private)/produccion/formulas/[id]/page.tsx` | `requirePagePermission('recetas.consultar')`, mismo criterio. |
| `lib/modules/identity/adapters/driving/login-action.ts` | El respaldo del destino deja de ser siempre el dashboard: es el primer enlace del menu filtrado (R11-R13). |
| `app/(public)/login/page.tsx` | Deja de fabricar `/dashboard` como destino de vuelta cuando no hay `?next=` — ver seccion 5.1. |
| `app/(public)/login/components/login-form.tsx` | El valor por defecto del campo oculto pasa de `DASHBOARD_ROUTE` a cadena vacia, por lo mismo. |
| `lib/modules/identity/domain/route-access.ts` | Sin `rules`, sin `roleName`, sin `'forbidden'`, sin `isAllowedByRules`; politica renumerada a cuatro pasos (R16). |
| `lib/modules/identity/adapters/driving/route-guard-middleware.ts` | Deja de importar la lista y de leer `claims.roleName`. Conserva firma, caducidad, empresa, `PRIVATE_ROUTE_PREFIXES` y las dos redirecciones (R17, R18). |
| `lib/modules/identity/index.ts` | Deja de exportar `findRouteRule` y `RouteRoleRule`. |
| `docs/architecture.md` | La seccion «Permisos y autenticacion» reescrita: el borde valida firma, caducidad y empresa y **ya no corta por rol**; el corte por permiso vive en la pagina (R16, R17). |

`middleware.ts` **no se toco**: es un cascaron que reexporta el handler y declara el `matcher`.
La cookie **sigue firmando `roleName`** (QC-8/QC-9 son sus duenos y `nav-user` lo pinta como
display): lo que se retiro es que el middleware **decida** con el.

### Tests — creados

`tests/unit/navegacion/nav-filtrado.test.ts`,
`tests/unit/navegacion/private-not-found.test.tsx`,
`tests/unit/navegacion/private-layout-menu.test.tsx`,
`tests/unit/navegacion/pantallas-exigen-permiso.test.tsx`,
`tests/unit/navegacion/qc75-convenciones.test.ts`,
`tests/unit/identity/require-page-permission.test.ts`,
`tests/unit/pedidos-ui/permiso-ruta-pedidos.test.ts` (sustituye a `route-role-pedidos.test.ts`),
`tests/guards/guard-nav-permisos-declarados.test.ts`,
`tests/guards/guard-pantallas-exigen-permiso.test.ts`,
`e2e/permisos.spec.ts`.

### Tests — borrados

`tests/unit/identity/route-role-rules.test.ts` (se fue lo que probaba) y
`tests/unit/pedidos-ui/route-role-pedidos.test.ts` (renombrado y reescrito por permiso).

### Tests — modificados

- **Por sustitucion de la afirmacion por rol** (T12): `tests/guards/guard-autorizacion-por-permiso.test.ts`
  (se retiran las dos anclas de la exencion y su prosa; el resto de la guardia intacto),
  `tests/guards/guard-rol-administrador-unico.test.ts` (solo prosa),
  `tests/unit/inventario/product-route-contract.test.ts`,
  `tests/unit/proveedores/supplier-route-contract.test.ts`,
  `tests/unit/pedidos-ui/order-route-contract.test.ts`,
  `tests/unit/recetas-ui/recipe-route-contract.test.ts`,
  `tests/unit/pedidos-ui/pedidos-convenciones.test.ts`,
  `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts`,
  `e2e/session.spec.ts` (**solo prosa**; fixture y aserciones sin tocar).
- **Por el cambio de decision de ruta**: `tests/unit/identity/route-access.test.ts` y
  `tests/unit/identity/route-guard-middleware.test.ts`.
- **Por el destino del login**: `tests/unit/identity/login-action.test.ts` y `tests/unit/login-form.test.tsx`.
- **Por el centinela del dashboard**: `tests/unit/dashboard-route-contract.test.ts` (seccion 5.2).
- **Fixtures de sesion que necesitaban permisos** para no quedarse sin menu ni sin pagina:
  `tests/unit/app-sidebar.test.tsx`, `tests/unit/sidebar-ajuste.test.tsx`,
  `tests/unit/sidebar-desktop.test.tsx`, `tests/unit/sidebar-mobile.test.tsx`,
  `tests/unit/dashboard-page.test.tsx`, `tests/unit/inventario/product-page.test.tsx`,
  `tests/unit/recetas-ui/recipe-page.test.tsx`, `tests/unit/recetas-ui/recipe-form.test.tsx`,
  `tests/unit/proveedores-ui/supplier-page.test.tsx`,
  `tests/unit/proveedores-ui/supplier-detail-page.test.tsx`,
  `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx`,
  `tests/unit/proveedores-ui/delete-catalog-line-dialog.test.tsx`,
  `tests/unit/pedidos-ui/order-sheet.test.tsx`, `tests/unit/pedidos-ui/pedidos-viewport.test.tsx`.
  En todos, el `SessionUser` del fixture deriva sus permisos de `PERMISSIONS`, nunca escritos a mano.

---

## 3. Mapa `R<n>` -> test

Los 22 requisitos, cada uno con el archivo y el caso concreto que lo cierra.

### R1-R5 · el menu se arma con los permisos de quien entra

| R | Requisito, en corto | Test que lo cubre |
| --- | --- | --- |
| **R1** | El menu se construye en el servidor filtrando `PRIVATE_NAV_ITEMS` con los permisos de la sesion | `tests/unit/navegacion/nav-filtrado.test.ts` > «conserva el enlace cuyo permiso esta en el conjunto» y «quita el enlace cuyo permiso NO esta en el conjunto». `tests/unit/navegacion/private-layout-menu.test.tsx` > «con solo `inventario.consultar`, ningun otro item aparece en el arbol» |
| **R2** | El enlace sin permiso **no viaja en el HTML**; no se oculta por CSS ni se decide en cliente | `tests/unit/navegacion/private-layout-menu.test.tsx` > «con solo `inventario.consultar`, ningun otro item aparece en el arbol» (`queryByTestId === null`, no una clase CSS). `e2e/permisos.spec.ts`: `toHaveCount(0)` sobre `nav-dashboard`, `nav-pedidos`, `nav-proveedores` y `nav-produccion` |
| **R3** | Un grupo sin ningun hijo visible desaparece entero | `tests/unit/navegacion/nav-filtrado.test.ts` > «el grupo sin ningun hijo visible desaparece ENTERO, etiqueta incluida (R3)» y «conserva el grupo con SOLO los hijos visibles». `e2e/permisos.spec.ts`: `nav-produccion` ausente |
| **R4** | El filtrado conserva orden y agrupacion; no reordena, no mueve, no duplica, no muta | `tests/unit/navegacion/nav-filtrado.test.ts` > «conserva el orden y la seccion de cada item; no reordena, no mueve ni duplica (R4)», «NO muta el array de entrada ni sus items ni los hijos de los grupos (R4)» y «devuelve estructuras nuevas: tocar el resultado no alcanza a la entrada» |
| **R5** | El permiso se declara en `private-nav.ts` con forma `<modulo>.consultar` y pertenece al catalogo; ningun componente decide | `tests/guards/guard-nav-permisos-declarados.test.ts` > «el arbol real no tiene ningun enlace con permiso desconocido ni sin permiso», con el ancla «el recorrido encuentra hoy los cinco enlaces reales del menu». Y los contratos de ruta, p. ej. `tests/unit/pedidos-ui/permiso-ruta-pedidos.test.ts` > «la pantalla exige pedidos.consultar y su item de menu declara el mismo permiso» |

### R6-R10 · entrar por URL sin permiso da 404

| R | Requisito, en corto | Test que lo cubre |
| --- | --- | --- |
| **R6** | Cada pantalla privada exige su `<modulo>.consultar` en el servidor, **antes de leer o pintar datos** | `tests/unit/navegacion/pantallas-exigen-permiso.test.tsx` > los `it.each` sobre las ocho paginas (sin permiso lanza y **ninguna** lectura de datos llego a hacerse) y «cada pantalla exige el permiso de SU modulo y no el de otro». `tests/guards/guard-pantallas-exigen-permiso.test.ts` > «cada pantalla privada llama a requirePagePermission con un codigo del catalogo» |
| **R7** | 404 con el mismo contenido que cualquier otro 404 privado; no nombra el modulo, ni permisos, ni roles | `tests/unit/navegacion/private-not-found.test.tsx` > «no menciona permisos, roles, autorizacion ni ningun modulo del catalogo» y «no pinta ningun enlace: no delata a donde si se puede ir». `tests/unit/identity/require-page-permission.test.ts` > «con sesion pero sin el permiso llama a notFound() y la llamada LANZA». `e2e/permisos.spec.ts`: `response.status() === 404` sobre la respuesta real |
| **R8** | Ese 404 se pinta **dentro** del layout privado: cabecera, cerrar sesion y el menu ya filtrado | `e2e/permisos.spec.ts`: en la pantalla de 404 siguen `private-not-found` y el control de cerrar sesion, alcanzable. `tests/unit/navegacion/private-layout-menu.test.tsx` > «sin ningun permiso, el menu queda sin items y el pie con cerrar sesion sigue ahi» |
| **R9** | Rol sin ningun permiso de consulta: 404 en toda ruta privada, sin pantalla de «sin acceso» y sin rechazar el login | `tests/unit/identity/require-page-permission.test.ts` > «con el conjunto de permisos VACIO tambien responde 404, sin pantalla de sin acceso». `tests/unit/navegacion/nav-filtrado.test.ts` > «con el conjunto de permisos vacio devuelve []». `tests/unit/identity/login-action.test.ts` > «aterriza en el dashboard cuando el usuario no tiene ningun permiso (R12)»: el login funciona con normalidad |
| **R10** | La comprobacion delega en `assertPermission`; no compara el conjunto a mano | `tests/unit/identity/require-page-permission.test.ts` > «el fuente delega en assertPermission y no compara el conjunto de permisos a mano» y «el permiso se compara EXACTO: `inventario.modificar` no abre `inventario.consultar`» |

### R11-R15 · el destino del login y las rutas de la cuenta

| R | Requisito, en corto | Test que lo cubre |
| --- | --- | --- |
| **R11** | Sin destino de vuelta valido se aterriza en el primer enlace visible del menu filtrado, entrando en grupos por orden | `tests/unit/identity/login-action.test.ts` > «aterriza en inventario cuando solo puede consultar inventario y no hay destino de vuelta (R11)», «entra en el grupo del menu cuando el unico permiso cuelga de uno de sus hijos (R11)» y «aterriza en el primer item del menu cuando tiene todos los permisos (R11)». `tests/unit/navegacion/nav-filtrado.test.ts` > el bloque `firstVisibleNavHref (R11)`. `e2e/permisos.spec.ts`: el Operador aterriza en `/inventario` |
| **R12** | Menu vacio: el login lleva igualmente a una ruta privada, que responde 404; nunca vuelve al login ni miente | `tests/unit/identity/login-action.test.ts` > «aterriza en el dashboard cuando el usuario no tiene ningun permiso (R12)». `tests/unit/navegacion/nav-filtrado.test.ts` > «devuelve null con la lista vacia (R12: el login usa entonces su ultimo respaldo)» |
| **R13** | Un destino de vuelta interno y valido sigue mandando (no regresion de QC-9 R8) | `tests/unit/identity/login-action.test.ts` > «el destino de vuelta interno gana al respaldo por permisos (R13, no regresion de QC-9 R8)» y «descarta un destino de vuelta externo y manda el respaldo calculado (R13)» |
| **R14** | Cerrar sesion no exige ningun permiso, ni con el conjunto vacio | `tests/unit/navegacion/private-layout-menu.test.tsx` > «con solo `inventario.consultar`, el control de cerrar sesion sigue presente» y «sin ningun permiso, el menu queda sin items y el pie con cerrar sesion sigue ahi». `e2e/permisos.spec.ts`: el control se abre y `private-logout` esta visible **en la pantalla de 404** |
| **R15** | Ningun permiso comodin, de «cuenta» ni equivalente: el catalogo sigue teniendo los diez de QC-74 | `tests/unit/navegacion/qc75-convenciones.test.ts` > «tiene exactamente diez codigos, los diez de QC-74», «ningun permiso es un comodin ni de modulo ni de accion», «los modulos son exactamente los cinco de negocio mas dashboard y unidades» y «las acciones del catalogo son solo consultar y modificar», con sus dos casos sinteticos |

### R16-R19 · la retirada del corte por rol del borde

| R | Requisito, en corto | Test que lo cubre |
| --- | --- | --- |
| **R16** | Se retira `ROUTE_ROLE_RULES` y todo corte por nombre de rol: ninguna decision del middleware depende del rol de la cookie | `tests/unit/identity/route-guard-middleware.test.ts` > «no lee el rol del contenido firmado ni nombra ninguna lista ruta a rol (R16)» y el bloque «el rol firmado ya no decide nada en el borde (R16)»: misma decision con dos roles distintos y con uno que no existe en el seed. `tests/unit/identity/route-access.test.ts` > «paso 4: el resto pasa, sea cual sea el rol (R16)» y «el dominio no menciona roles ni reglas ruta a rol». `tests/unit/pedidos-ui/permiso-ruta-pedidos.test.ts` > «con sesion valida pasa, sea cual sea el rol» |
| **R17** | El middleware sigue validando firma, caducidad y empresa, y conserva las dos redirecciones | `tests/unit/identity/route-guard-middleware.test.ts` > «redirige al login con la ruta pedida cuando no hay cookie en una ruta privada (R17)», «trata como sin sesion una cookie caducada», «trata como sin sesion una cookie con la firma manipulada», «redirige al dashboard quien pide el login con sesion valida» y el bloque «la empresa firmada y el portero de rutas (QC-48)». `tests/unit/identity/route-access.test.ts` > los pasos 2 y 3. `tests/guards/guard-doc-permisos.test.ts` |
| **R18** | Ninguna consulta a base, ni repositorio, ni catalogo de permisos en el cierre de imports del middleware | `tests/guards/guard-middleware-edge.test.ts`, **sin tocar**: recorre el cierre de imports desde `middleware.ts`. `tests/unit/identity/route-guard-middleware.test.ts` > «no importa la composicion Node ni ningun repositorio: el borde no consulta la base (R4)» |
| **R19** | El conjunto de permisos sale de la **misma** lectura de sesion; ninguna consulta nueva por peticion | `tests/unit/navegacion/private-layout-menu.test.tsx` > «el layout hace una sola lectura de sesion para pintar el menu» (`toHaveBeenCalledTimes(1)`) |

### R20-R22 · que no se quede atras

| R | Requisito, en corto | Test que lo cubre |
| --- | --- | --- |
| **R20** | Guardias ejecutables: ninguna pantalla privada sin permiso, ningun enlace con permiso fuera del catalogo | `tests/guards/guard-pantallas-exigen-permiso.test.ts`, 10 casos: arbol real, ancla de las ocho paginas, las dos clases de infraccion (sin llamada / codigo inexistente) y que no se ciega con comentarios. `tests/guards/guard-nav-permisos-declarados.test.ts`, 7 casos: arbol real, ancla de los cinco enlaces, permiso desconocido, permiso ausente y recursion en los hijos de grupo |
| **R21** | E2E del recorrido completo del Operador | `e2e/permisos.spec.ts` > «el Operador entra, aterriza en inventario, ve un menu corto y recibe 404 en un modulo que no puede consultar, con el control de cerrar sesion presente», verde en Chromium y WebKit |
| **R22** | Ninguna dependencia nueva, ni cambio de esquema, seed o casos de uso de los modulos de negocio | `tests/unit/navegacion/qc75-convenciones.test.ts` > «no toca el esquema, las migraciones, el seed ni el dominio de los cinco modulos de negocio», «package.json no gano dependencias respecto al merge-base con dev» y «las rutas congeladas nombran archivos que existen hoy en el repo», con sus casos sinteticos. `tests/guards/guard-dependencias-aprobadas.test.ts`, ya existia y no se toco |

---

## 4. Salida real de lo que corri

**Regla del gate**: yo corro `typecheck`, `lint` y `vitest related` sobre los archivos de la
ficha. La suite completa (`./init.sh`) la corre el leader.

### Typecheck y lint, sobre el arbol final

```
$ pnpm run typecheck
> quimicloude@0.1.0 typecheck
> tsc --noEmit
(sin salida: cero errores)

$ pnpm run lint
> quimicloude@0.1.0 lint
> eslint
(sin salida: cero errores)
```

### Guardias — van siempre, ninguna la selecciona el grafo de imports

```
$ pnpm exec vitest run tests/guards/
 Test Files  19 passed (19)
      Tests  190 passed (190)
   Duration  9.08s
```

Incluye las dos nuevas (`guard-nav-permisos-declarados`, `guard-pantallas-exigen-permiso`), las
tocadas (`guard-autorizacion-por-permiso`, `guard-rol-administrador-unico`, `guard-doc-permisos`)
y `guard-middleware-edge` **verde sin tocarse** (R18).

### Relacionados con el diff de la rama

```
$ pnpm exec vitest related --run $(git diff --name-only origin/dev...HEAD)
 Test Files  1 failed | 139 passed (140)
      Tests  5 failed | 1774 passed | 6 skipped (1785)
   Duration  280.44s
```

Los cinco rojos son de `tests/unit/proveedores-ui/catalog-line-sheet.test.tsx` y
`tests/unit/proveedores-ui/supplier-page.test.tsx`, los dos **ya listados en
`tests/baseline-rojos.json`** por el flake de saturacion de `userEvent`. Firma exacta de
`docs/verification.md`: `Test timed out in 5000ms`, medidos en 5025 ms y 5043 ms. Comprobado
como manda el documento, corriendo los archivos **solos**:

```
$ pnpm exec vitest run tests/unit/proveedores-ui/catalog-line-sheet.test.tsx tests/unit/proveedores-ui/supplier-page.test.tsx
 Test Files  2 passed (2)
      Tests  50 passed (50)
   Duration  84.54s
```

Verdes en aislado y rojos en la corrida grande: es saturacion, no un fallo de esta ficha.

### E2E de la ficha

```
$ pnpm exec playwright test e2e/permisos.spec.ts
  2 passed (15.5s)      [chromium] 1/1 · [webkit] 1/1
```

Base propia del worktree, **`QuimiCloude_QC75`**, creada, migrada y sembrada para esta rama
(2 roles, 10 permisos, 11 asignaciones). El `DATABASE_URL` del `.env` del worktree apunta ahi;
la base compartida no se toco. Esta ficha no trae migracion (R22): la base propia existe solo
para que el E2E no corra contra datos de otra rama.

### Corridas por tanda, tal y como las cerro cada agente

| Tanda | Comando | Resultado |
| --- | --- | --- |
| 1 (T1-T3) | `vitest related --run lib/shared/navigation/private-nav.ts ...` | `25 passed (25)` · `345 passed (345)` |
| 1 (T1-T3) | `vitest run nav-filtrado + guard-nav-permisos-declarados + guard-nav-serializable` | `3 passed (3)` · `28 passed (28)` |
| 2 (T4) | `vitest run tests/unit/identity/require-page-permission.test.ts` | `1 passed (1)` · `6 passed (6)` |
| 2 (T5, T7) | `vitest run private-not-found + private-layout-menu` | `2 passed (2)` · `10 passed (10)` |
| 2 (T5, T7) | no regresion del armazon privado, 6 archivos | `6 passed (6)` · `52 passed, 1 skipped (53)` |
| 2 (T6, T8) | `vitest run pantallas-exigen-permiso + guard-pantallas-exigen-permiso` | `2 passed (2)` · `43 passed (43)` |
| 2 (T6, T8) | no regresion de las cinco pantallas | `5 passed (5)` · `114 passed (114)` |
| 2 (T6, T8) | no regresion de los cinco paneles y formularios | `5 passed (5)` · `77 passed (77)` |
| 3 (T9) | `vitest run tests/unit/identity/login-action.test.ts` | `1 passed (1)` · `19 passed (19)` |
| 4 (T11) | `vitest run route-access + route-guard-middleware + middleware-root-contract` | `3 passed (3)` · `72 passed (72)` |
| 4 (T12) | `vitest run tests/guards/` | `19 passed (19)` · `190 passed (190)` |
| 4 (T13) | `vitest run tests/guards/guard-doc-permisos.test.ts` | `1 passed (1)` · `6 passed (6)` |
| 4 (centinela) | `vitest run dashboard-route-contract + dashboard-page` | `2 passed (2)` · `16 passed (16)` |
| 4 (centinela) | los cinco contratos de ruta, ya por permiso | `5 passed (5)` · `75 passed (75)` |
| 5 (T15) | `vitest run tests/unit/navegacion/qc75-convenciones.test.ts` | `1 passed (1)` · `13 passed (13)` |
| 5 (arreglo del login) | `vitest run login-form + login-skin + uncontrolled-warning + login-action + return-path` | `5 passed (5)` · `104 passed (104)` |
| 5 (arreglo del login) | `vitest related --run login/page.tsx + login-form.tsx` | `3 passed (3)` · `56 passed (56)` |

---

## 5. Dos cosas que no estaban en el plan, y hay que leer

### 5.1 El E2E destapo que R11 no se cumplia de verdad, y se arreglo

`e2e/permisos.spec.ts` salio rojo la primera vez, en **los dos motores**, con el Operador
aterrizando en `/dashboard` en vez de en `/inventario`.

La causa: `app/(public)/login/page.tsx` rellenaba el campo oculto del formulario con
`resolveReturnPath(candidato, DASHBOARD_ROUTE)`. Entrar a `/login` **sin `?next=`** —el camino
normal— hacia que ese campo viajara con el valor `/dashboard`. En `loginAction` ese valor es un
destino de vuelta **interno y valido**, asi que ganaba en `resolveReturnPath(...)` y el respaldo
por permisos que T9 acababa de anadir **quedaba muerto en todo login normal**. El test unitario
de T9 pasaba porque le entregaba un `formData` sin ese campo; en el navegador el campo siempre
esta.

Consecuencia real: el Operador aterrizaba en `/dashboard`, que le responde 404. Exactamente lo
que R11 y `design.md > 3` existen para evitar.

**Arreglo, minimo**: la pagina de login ya no fabrica un destino de vuelta que el usuario no
pidio. Solo transporta el que trajo la URL si es valido; si no lo hay, entrega cadena vacia y
`loginAction` calcula el respaldo. Es seguro porque `resolveReturnPath('', fallback)` devuelve el
`fallback` —`isInternalPath('')` es `false`—, asi que QC-9 R8/R9 no se debilita: un `?next=`
valido sigue mandando y uno externo se sigue descartando. Lo unico que cambia es **cual es el
respaldo cuando no hay destino de vuelta**.

**Red que impide que vuelva**: `tests/unit/identity/login-action.test.ts` gana un caso con el
campo `RETURN_PARAM` **presente pero vacio** —que es lo que manda el navegador— y un Operador,
afirmando `INVENTORY_ROUTE`. Y `tests/unit/login-form.test.tsx` afirma que sin `?next=` el campo
oculto viaja vacio.

**Esto es lo que justifica que R21 exigiera E2E**: los cinco casos unitarios de T9 estaban verdes
y el requisito estaba incumplido.

### 5.2 El centinela del dashboard se acota, no se borra

`tests/unit/dashboard-route-contract.test.ts`, de QC-9, prohibia que `dashboard/page.tsx`
contuviera `@/lib/modules/`. La linea que T6 anade por R6 es exactamente
`import { requirePagePermission } from '@/lib/modules/identity/adapters/driving/require-page-permission';`.
El centinela decia la verdad de QC-9, y esa verdad cambio.

Se **acoto**, no se borro: `dashboard-content.tsx` conserva la prohibicion entera, y `page.tsx`
puede importar **exactamente** ese helper y nada mas. Ademas se anadieron (a) un caso positivo
que exige que hoy `page.tsx` **si** llame a `requirePagePermission` con el codigo derivado de
`PERMISSIONS`, para que el caso negativo no pueda quedar verde por vacuidad, y (b) un caso
sintetico que demuestra que la excepcion no es un colador: un fuente que importe el helper
permitido **y ademas** `@/lib/composition` sale infractor.

---

## 6. Notas para el reviewer

- **El 404 se dispara desde cada `page.tsx`, nunca desde el layout.** Esta escrito y razonado en
  `app/(private)/not-found.tsx`: un `notFound()` lanzado en un layout hace fallar ese layout, asi
  que responderia el limite de **arriba** y el 404 saldria pelado, sin menu ni boton de salir.
  Justo lo que la decision cerrada numero 3 existe para evitar.
- **Limite conocido y aceptado** (`design.md > 2.3`): una URL que no casa con **ninguna** ruta del
  App Router, como `/inventario/loquesea`, la resuelve el limite raiz de Next, fuera del layout
  privado. Dentro del conjunto de rutas privadas declaradas, «sin permiso» y «no existe» si son
  indistinguibles, que es lo que R7 exige. El catch-all `[...slug]` se descarto porque `(private)`
  es un route group y capturaria toda URL no reconocida de la aplicacion, publicas incluidas.
- **El alta y la edicion de receta piden `consultar`, no `modificar`**, a proposito: la escritura
  la exige el service al guardar y QC-74 decidio que no hay implicacion entre permisos. La ruta
  decide si se **enseña** una pantalla; el service decide si se puede **hacer**.
- **`/login` con sesion viva sigue redirigiendo a `DASHBOARD_ROUTE`** desde el middleware: el
  borde no conoce los permisos y no va a conocerlos (R18). Para quien no tenga
  `dashboard.consultar` eso acaba en el 404 del layout, con su menu a la izquierda para seguir.
  Queda documentado en el propio middleware.
- **En WebKit, el ultimo paso del E2E abre el menu de usuario por teclado y no con el raton.** No
  es una concesion: el overlay de desarrollo de Next (`<nextjs-portal>`) intercepta los eventos de
  puntero sobre la pantalla de 404, y solo en WebKit. `e2e/session.spec.ts` hace el mismo clic con
  raton en `/inventario` y pasa, o sea que es un artefacto de `next dev`, no del codigo de la
  feature. Abrirlo por teclado ademas demuestra algo mejor: que el control de cerrar sesion es
  alcanzable sin raton desde el 404. Esta comentado en el spec, con la nota de que contra un build
  de produccion el raton volveria a funcionar.
- **Ningun archivo de codigo del repo menciona ya `ROUTE_ROLE_RULES`**: las unicas apariciones
  quedan en `specs/` y `progress/`, que son historia.
- `tests/unit/composition/identity-facade.test.ts` fallo una vez por timeout de 5 s al importar
  `@/lib/composition`, y **pasa en aislado** (`5 passed`). Mismo flake de saturacion, aunque este
  archivo no esta en el baseline. Se reporta, no se diagnostica: cae fuera de los archivos de esta
  ficha.
- **Higiene del diff**: tres archivos se habian guardado con los finales de linea invertidos
  (`docs/architecture.md` a LF, el layout privado y dos tests de sidebar a CRLF), lo que inflaba
  el diff con mas de 1.900 lineas de ruido. Se restauro la convencion original de cada archivo y
  se corrigio el commit, asi que el diff que llega al reviewer es solo el cambio real.
