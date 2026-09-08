# QC-75 — menu-y-rutas-por-permiso · tasks.md

> Cada task dice **qué archivos toca** y su **criterio de hecho**. `[P]` = puede ir en paralelo con
> las otras `[P]` de su misma tanda. `./init.sh --rapido` cierra cada tanda; `./init.sh` completo
> cierra la feature y va antes del PR, sin excepción.

## Tanda 1 — la fuente de la navegación

- [x] **T1. `permission` en cada enlace del menú** (R5)
  - Toca: `lib/shared/navigation/private-nav.ts`.
  - Añade `permission: string` **obligatorio** a `NavLink` (con su JSDoc: por qué es `string` y no
    `PermissionCode`, y qué guardia cubre el hueco) y rellena los cinco enlaces actuales:
    `dashboard.consultar`, `inventario.consultar`, `pedidos.consultar`, `recetas.consultar`,
    `proveedores.consultar`. `NavGroup` **no** lo lleva.
  - Hecho: `pnpm run typecheck` verde y todo constructor de `NavLink` del repo (producción y tests)
    compila con el campo nuevo.

- [x] **T2. Filtro y primer enlace, puros** (R1, R3, R4, R11) — depende de T1
  - Toca: `lib/shared/navigation/private-nav.ts`, `tests/unit/navegacion/nav-filtrado.test.ts` (nuevo).
  - Implementa `filterNavItemsByPermissions` y `firstVisibleNavHref` según `design.md > 1.2`.
  - Hecho: tests verdes para — enlace con permiso se conserva; sin permiso desaparece; grupo con un
    hijo visible se conserva con solo ese hijo; **grupo sin hijos visibles desaparece entero**;
    orden y secciones intactos; conjunto de permisos vacío → `[]`; `firstVisibleNavHref` devuelve el
    primer enlace de arriba abajo entrando en grupos, y `null` con la lista vacía; ninguna de las dos
    muta el array de entrada.

- [x] **T3. [P] Guardia: los permisos del menú existen** (R20)
  - Toca: `tests/guards/guard-nav-permisos-declarados.test.ts` (nuevo).
  - Patrón de `guard-rutas-privadas-cubiertas.test.ts`: funciones puras exportadas + casos
    sintéticos + ancla anti-vacuidad.
  - Hecho: verde con el árbol real; roja con un `NavLink` sintético cuyo `permission` no está en
    `PERMISSIONS` y con otro que no declara ninguno; el ancla afirma que hoy encuentra los cinco
    enlaces reales.

## Tanda 2 — el corte por permiso en cada pantalla

- [x] **T4. El helper `requirePagePermission`** (R6, R10) — depende de nada, va con T1/T2 si se quiere
  - Toca: `lib/modules/identity/adapters/driving/require-page-permission.ts` (nuevo),
    `tests/unit/identity/require-page-permission.test.ts` (nuevo).
  - Implementación de `design.md > 2.1`, con el comentario que explica por qué `onDenied:
    () => notFound()` y por qué no se sustituye por un `if`.
  - Hecho: tests (con `identity` y `next/navigation` mockeados) verdes para — sin sesión llama a
    `redirect(LOGIN_ROUTE)` y **no** a `notFound`; con el permiso no llama a ninguno de los dos; sin
    el permiso llama a `notFound()`; y el fuente no contiene ningún `.includes(` sobre `permissions`
    (delega en `assertPermission`, R10).

- [x] **T5. La pantalla de 404 de la zona privada** (R7, R8, R9, R14) — depende de T2
  - Toca: `app/(private)/not-found.tsx` (nuevo), `tests/unit/navegacion/private-not-found.test.tsx`
    (nuevo).
  - Copy neutro, `data-testid="private-not-found"`, sin mencionar permisos, roles ni el módulo.
  - Hecho: el test renderiza el componente y afirma que el texto no contiene «permiso», «rol»,
    «autoriz» ni el nombre de ningún módulo; y el test del layout (T7) demuestra que se pinta
    envuelto por la barra lateral.

- [x] **T6. Las ocho páginas piden su permiso** (R6) — depende de T4
  - Toca: los ocho `app/(private)/**/page.tsx` de la tabla de `design.md > 2.2`.
  - Una línea al principio de cada componente de página, antes de cualquier lectura de datos.
    Actualiza el JSDoc que hoy dice «aquí no se decide ningún permiso» en las páginas que lo tengan.
  - Hecho: cada página tiene su test (o su caso añadido al test de contrato de ruta existente) que
    afirma que **con el permiso** renderiza y **sin él** dispara `notFound`. `typecheck` verde.

- [x] **T7. El layout filtra el menú** (R1, R2, R19) — depende de T2
  - Toca: `app/(private)/layout.tsx`, `tests/unit/navegacion/private-layout-menu.test.tsx` (nuevo).
  - Hecho: el layout renderizado con un `SessionUser` de permisos `['inventario.consultar']` no
    contiene `nav-dashboard`, `nav-pedidos`, `nav-proveedores` ni `nav-produccion` en el árbol
    (`queryByTestId === null`, no una clase CSS), sí contiene `nav-inventario` y el control de
    cerrar sesión; con permisos `[]` el `nav` queda sin ítems y el pie con cerrar sesión sigue ahí.
    Y el test afirma que el layout **no** hace ninguna llamada de sesión adicional (un solo
    `getSessionUser`).

- [x] **T8. [P] Guardia: ninguna pantalla privada sin permiso** (R20) — depende de T6
  - Toca: `tests/guards/guard-pantallas-exigen-permiso.test.ts` (nuevo).
  - Hecho: verde con el árbol real (ancla: encuentra las ocho páginas y las ocho llaman al helper);
    roja con una página sintética sin la llamada y con otra que la hace con un código que no está en
    `PERMISSIONS`.

## Tanda 3 — el destino del login

- [x] **T9. El respaldo del login es el primer ítem del menú filtrado** (R11, R12, R13) — depende de T2
  - Toca: `lib/modules/identity/adapters/driving/login-action.ts`, su test unitario existente.
  - Hecho: tests verdes para — Operador sin destino de vuelta → `/inventario`; usuario sin ningún
    permiso → `DASHBOARD_ROUTE` (que a su vez dará 404, R12); destino de vuelta interno válido →
    gana él (no regresión de QC-9 R8); destino de vuelta externo → se descarta y manda el respaldo.

## Tanda 4 — la retirada del corte por rol

- [x] **T10. Borrar la lista y el gancho** (R16) — depende de T6 (el corte nuevo tiene que existir antes)
  - Toca: borra `lib/composition/route-role-rules.ts` y
    `lib/modules/identity/domain/route-role-rules.ts`; borra
    `tests/unit/identity/route-role-rules.test.ts`; quita los dos exports del barrel
    `lib/modules/identity/index.ts`.
  - Hecho: `rg ROUTE_ROLE_RULES` no devuelve ningún archivo de producción; `typecheck` señala
    exactamente los consumidores que quedan (los de T11).

- [x] **T11. Simplificar la decisión de ruta y el middleware** (R16, R17, R18) — depende de T10
  - Toca: `lib/modules/identity/domain/route-access.ts`,
    `lib/modules/identity/adapters/driving/route-guard-middleware.ts`,
    `tests/unit/identity/route-access.test.ts`, `tests/unit/identity/route-guard-middleware.test.ts`.
  - Quita `rules` de `RouteAccessInput`, `roleName` de `RouteAccessSession`, `'forbidden'` de
    `RedirectReason` y el paso 4 de la política. `middleware.ts` **no se toca**.
  - Hecho: tests verdes para — anónimo en ruta privada → login con `next`; sesión en `/login` →
    destino de vuelta o dashboard; ruta pública → `allow`; **ruta privada con sesión válida →
    `allow` sea cual sea el rol** (R16); sesión caducada → tratada como anónima. Y
    `tests/guards/guard-middleware-edge.test.ts` sigue verde sin tocarse (R18).

- [x] **T12. Los centinelas y contratos que nombran la lista** (R16) — depende de T11
  - Toca: `tests/guards/guard-autorizacion-por-permiso.test.ts` (quita las dos anclas de la exención
    y su prosa), `tests/guards/guard-rol-administrador-unico.test.ts` (solo prosa),
    `tests/unit/inventario/product-route-contract.test.ts`,
    `tests/unit/proveedores/supplier-route-contract.test.ts`,
    `tests/unit/pedidos-ui/order-route-contract.test.ts`,
    `tests/unit/pedidos-ui/route-role-pedidos.test.ts`,
    `tests/unit/recetas-ui/recipe-route-contract.test.ts`,
    `tests/unit/pedidos-ui/pedidos-convenciones.test.ts`,
    `tests/unit/proveedores-ui/guard-convenciones-proveedores.test.ts`, `e2e/session.spec.ts` (prosa).
  - En los contratos de ruta, la afirmación por rol se **sustituye** por la de permiso (la pantalla
    exige `<modulo>.consultar` y su ítem de menú declara el mismo código), no se borra.
  - Hecho: `./init.sh` completo verde; ningún archivo del repo (fuera de `specs/` y `progress/`)
    menciona `ROUTE_ROLE_RULES`.

- [x] **T13. [P] Actualizar `docs/architecture.md > Permisos y autenticacion`** (R16, R17)
  - Toca: `docs/architecture.md`.
  - El middleware **valida firma y caducidad** (esas palabras se quedan juntas), ya no corta por rol,
    y el corte por permiso vive en la página, con el layout privado como última línea de defensa. Se
    conserva literal «la autorizacion se valida en el service».
  - Hecho: `tests/guards/guard-doc-permisos.test.ts` verde y ninguna frase del documento afirma un
    corte por rol en el borde.

## Tanda 5 — la prueba de verdad

- [x] **T14. E2E del Operador** (R21) — depende de T6, T7, T9, T11
  - Toca: `e2e/permisos.spec.ts` (nuevo).
  - Fixture con el patrón de `e2e/session.spec.ts`: prefijo `qc75_e2e_`, empresa efímera propia,
    limpieza defensiva por edad, y el rol **`Operador` real del seed** (si no existe, fallo explícito
    que pide correr el seed). Pasos y aserciones en `design.md > 9`.
  - Hecho: `pnpm run e2e` verde en Chromium y WebKit; el paso del 404 afirma `response.status() ===
    404` **y** la presencia del control de cerrar sesión.

- [x] **T15. [P] Ausencia de comodín y de backend nuevo** (R15, R22)
  - Toca: `tests/unit/navegacion/qc75-convenciones.test.ts` (nuevo).
  - Hecho: afirma que `PERMISSIONS` sigue teniendo diez códigos y ninguno de módulo `cuenta`/
    comodín; que `db/schema.prisma`, `db/migrations/**`, el seed y `lib/modules/*/domain/**` de los
    cinco módulos de negocio **no aparecen** en el rango `origin/dev..HEAD`; y que `package.json` no
    ganó dependencias (junto con `guard-dependencias-aprobadas`, ya existente).

## Cierre

- [ ] **T16. Bitácora y trazabilidad** — depende de todas
  - Toca: `progress/impl_QC-75-menu-y-rutas-por-permiso.md`.
  - Hecho: contiene el mapa `R1..R22 -> test` completo (`CHECKPOINTS.md > Trazabilidad`), el comando
    y la salida de cada verde, y `./init.sh` completo en verde pegado antes del PR.
