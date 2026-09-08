# QC-45 — pantalla-de-presentaciones · tasks.md

> Cada task tiene **criterio de hecho** verificable. `[P]` = paralelizable con las de su mismo
> bloque. Se cierra cada tanda con `./init.sh --rapido` y la feature entera con `./init.sh`
> completo, **antes del PR, sin excepción** (regla 5 de `CLAUDE.md`).
>
> Nomenclatura de archivos de test: los unitarios de esta pantalla viven en
> `tests/unit/configuracion-ui/`, siguiendo `tests/unit/pedidos-ui/` y `tests/unit/proveedores-ui/`.

## T0 — Inventario de lo heredado (BLOQUEA todo lo demás)

- [x] Verificar en el worktree, **antes de escribir una línea**, que existen y funcionan: el layout
      privado con su `<main>` y su `<Toaster />`, `AppSidebar`, `PRIVATE_NAV_ITEMS`,
      `components/shared/data-table/` con `cell: (row) => ReactNode`, las primitivas `table`,
      `sheet`, `alert-dialog`, `input`, `label`, `button`, `sonner`, `skeleton`, las cuatro Server
      Actions de presentación, `tests/helpers/viewport.ts` y Playwright.
- [x] Anotar en `progress/impl_QC-45-pantalla-de-presentaciones.md` la lista con su evidencia.
- **Hecho cuando:** la nota existe y **no se ha creado ni modificado** ninguno de esos archivos.
- **Por qué existe:** el choque entre las features 4 y 10 ya ocurrió una vez en este repo (R33).

## Bloque 1 — Ruta, protección y navegación (va ANTES que la página)

### T1 — Constante de ruta + prefijo privado + corte por permiso *(depende de T0)*
- [x] `lib/shared/routes.ts`: `PRESENTATIONS_ROUTE = '/configuracion/presentaciones'` con su
      comentario de por qué vive ahí, y su entrada en `PRIVATE_ROUTE_PREFIXES`.
- [x] ~~`lib/composition/route-role-rules.ts`: fila
      `{ prefix: PRESENTATIONS_ROUTE, roles: [ROLE_ADMINISTRADOR] }`.~~ **Hecho con el mecanismo
      nuevo (ronda 2, 2026-09-08).** La fila llegó a escribirse en la ronda 1, pero QC-75
      (`menu-y-rutas-por-permiso`) **borró `lib/composition/route-role-rules.ts` y el mecanismo
      ruta→rol entero** (QC-75 R16): el middleware ya solo mira firma, caducidad y empresa. El
      corte pasa a la propia pantalla, que abre con
      `await requirePagePermission('inventario.modificar')` — permiso de `modificar` y no de
      `consultar` porque administrar el catálogo de presentaciones es modificar inventario, y el
      Operador del seed, que sólo tiene `inventario.consultar`, no debe entrar a una pantalla cuyo
      propósito entero es escribir.
- [x] Test `tests/unit/configuracion-ui/presentations-route-contract.test.ts`: la constante existe,
      está en los prefijos, no está duplicada en ningún otro archivo, la pantalla exige
      `inventario.modificar` con `requirePagePermission` **antes** de resolver `searchParams`
      (test de fuente, con los comentarios quitados antes de juzgar) y su ítem de menú declara el
      mismo código. `guard-middleware-edge` y `guard-pantallas-exigen-permiso` siguen verdes.
- **Hecho cuando:** `pnpm vitest run tests/unit/configuracion-ui tests/guards` en verde y
      `PRESENTATIONS_ROUTE` no aparece duplicada en ningún otro archivo.
- **Nota:** va antes de T5 a propósito; con `page.tsx` y sin prefijo, `guard-rutas-privadas-cubiertas`
      pone el gate en rojo.

### T2 — Sección Configuración y ocultado por permiso *(depende de T1)*

> **SE IMPLEMENTA, con el mecanismo de QC-75 (ronda 2, 2026-09-08).** El recorte de alcance que
> aquí figuraba —«no se implementa, QC-75 está en vuelo»— queda **levantado**: QC-75 ya está
> mergeado en `dev`. Y el **texto original de esta task describía el apaño por ROL** (campo
> `adminOnly` en `NavLink` y una función `visibleNavItems` aplicada en `layout.tsx`), que existía
> sólo porque QC-75 no estaba. **Manda el mecanismo por PERMISO:** `NavLink.permission` es
> obligatorio y `app/(private)/layout.tsx` ya filtra con
> `filterNavItemsByPermissions(PRIVATE_NAV_ITEMS, user.permissions)`. No se añade `adminOnly`, no
> se escribe `visibleNavItems` y **`layout.tsx` no se toca**: no hay nada que añadirle.

- [x] `private-nav.ts`: `NAV_SECTION_CONFIGURATION`, `PRESENTATIONS_LABEL` y el ítem —última
      entrada de nivel superior— con `href: PRESENTATIONS_ROUTE` (importada, nunca el literal),
      `testId: 'nav-presentaciones'`, `icon: 'boxes'` (ya existía en `NavIconName` y en
      `NAV_ICONS`) y `permission: 'inventario.modificar'`, el mismo código que exige la pantalla.
      Sección con **un solo ítem** a propósito: «Unidades» llega con QC-39.
- [x] ~~`app/(private)/layout.tsx`: aplicar `visibleNavItems(...)`.~~ **No procede:** QC-75 ya
      filtra ahí por permiso. `AppSidebar` tampoco se toca.
- [x] Test `tests/unit/configuracion-ui/private-nav-configuracion.test.ts`: hay **una** sección
      Configuración con **un** ítem que apunta a `PRESENTATIONS_ROUTE` y declara
      `inventario.modificar`; ningún ítem de esa sección apunta a una ruta sin `page.tsx`
      (comprobado en disco); con los permisos del Administrador (`SEED_ROLE_PERMISSIONS`,
      importados) están el ítem **y** la sección; con los del Operador desaparecen **los dos**
      (`groupNavItemsBySection` no deja encabezado huérfano).
- [x] Test en `tests/unit/navegacion/private-layout-menu.test.tsx` (ampliación, no reescritura, y
      ahí en vez de en `private-layout.test.tsx`: es el archivo que QC-75 dedicó al menú filtrado):
      el layout pinta `nav-presentaciones` con los permisos del Administrador y **no** lo pinta con
      los del Operador, que tiene `inventario.consultar` y no `inventario.modificar`.
- **Hecho cuando:** los dos tests en verde y `guard-nav-serializable`,
      `guard-nav-permisos-declarados` y `tests/unit/app-sidebar.test.tsx` siguen verdes (sus anclas
      de cinco ítems pasan a seis).

## Bloque 2 — Parser y columnas (piezas puras, antes de la UI)

### T3 [P] — `presentation-list-params.ts` *(depende de T1)*
- [x] `parsePresentationListParams`, `buildPresentationListQuery`, `presentationListHref`, con
      `page`, `pageSize`, `sort` y `q`; `filters` siempre `{}`; campo de orden validado contra
      `PRESENTATION_QUERYABLE.sortable` **importado**; `pageSize` contra `PAGE_SIZE_OPTIONS` y
      `DEFAULT_PAGE_SIZE` importados.
- [x] Test `tests/unit/configuracion-ui/presentation-list-params.test.ts`: entradas basura
      (`'abc'`, `'0'`, `'-3'`, `'1.5'`, `'1e3'`, arrays, `pageSize=1000`, `sort=creado:asc`,
      `sort=name:arriba`) producen siempre parámetros válidos y **nunca** lanzan; `parse(build(p))`
      devuelve `p`; `presentationListHref` deriva de `PRESENTATIONS_ROUTE`.
- **Hecho cuando:** el test en verde, sin montar DOM.

### T4 [P] — `presentation-columns.tsx` + `presentation-row-actions.tsx` *(depende de T0)*
- [x] Las **dos** columnas de `§6` del diseño; acciones como columna normal (`pinnable: false`, sin
      `sortable`, sin `filter`).
- [x] Botones editar y borrar siempre visibles, `min-h-11 min-w-11`, con nombre accesible que
      incluye el nombre de la presentación.
- [x] Test `tests/unit/configuracion-ui/presentation-columns.test.tsx`: recorre la declaración y
      afirma que hay exactamente dos columnas, que ninguna expone `id`, `createdAt`, `updatedAt`,
      `nameNormalized` ni autoría, que solo `name` es ordenable y que la de acciones no ordena ni
      filtra; los dos botones existen y son alcanzables por rol ARIA.
- [x] Test `tests/unit/configuracion-ui/data-table-intacta.test.ts`: ningún archivo de
      `components/shared/data-table/` ni de `components/ui/` fue modificado por esta feature (se
      compara contra `dev` con `git`), y el barrel compartido no exporta ninguna prop nueva de
      acciones de fila.
- **Hecho cuando:** ambos tests en verde.

## Bloque 3 — Página, sección y estados

### T5 — `page.tsx` + `presentation-list-section.tsx` + los tres estados *(depende de T1, T3)*
- [x] `app/(private)/configuracion/presentaciones/page.tsx`: Server Component, `searchParams`,
      `<Suspense key={buildPresentationListQuery(params)}>`, sin `main` ni armazón propio.
- [x] Sección `async` que llama a `listPresentationsAction(params)` y despacha a error / vacío /
      tabla, sin leer sesión ni repetir autorización.
- [x] `presentation-list-skeleton.tsx`, `presentation-list-empty.tsx` (con slot para el
      disparador de alta y enlace a la primera página) y `presentation-list-error.tsx` (mensaje +
      reintento).
- [x] Test `tests/unit/configuracion-ui/presentation-page.test.tsx`: la página existe en la ruta
      **derivada** de la constante; renderiza sin declarar `main`; con `status:'error'` sale el
      estado de error y **ninguna fila**; con `code:'unauthorized'` idem; con `items: []` sale el
      vacío con la acción de crear la primera; con página > total sale el enlace a la primera; la
      carga muestra el esqueleto.
- **Hecho cuando:** el test en verde y `guard-rutas-privadas-cubiertas` sigue verde.

### T6 — `presentation-table.tsx` *(depende de T4, T5)*
- [x] Monta `<DataTable>` del barrel compartido con `tableId`, columnas, `getRowId`, `params`,
      `totalPages`, `status="idle"`, textos propios y `onParamsChange -> router.push(presentationListHref(next))`.
      **`searchable` ausente** (= `true`).
- [x] Test `tests/unit/configuracion-ui/presentation-table.test.tsx`: cambiar página, tamaño (10/25),
      orden de la columna nombre y término de búsqueda **navega** a la URL esperada; el indicador de
      página y el selector de tamaño son los de la tabla compartida (`data-table-*`); la pantalla no
      reordena ni filtra en cliente (las filas se pintan en el orden recibido).
- **Hecho cuando:** el test en verde y no existe en la ruta ninguna tabla ni barra de paginación
      propias.

## Bloque 4 — Escrituras

### T7 [P] — `presentation-sheet.tsx` + `presentation-form.tsx` *(depende de T5)*
- [x] Panel lateral único para alta y edición; disparador de barra, disparador de fila y uso como
      `children` del estado vacío; edición precargada y `updatePresentationAction.bind(null, id)`.
- [x] Formulario de **un solo campo** con validación previa por los esquemas del contrato, error por
      **código** junto al campo (`duplicate_name`) o en la región de error, y sin cerrar el panel.
- [x] Éxito: cerrar, `toast.success`, `router.refresh()`, sin perder los parámetros de la URL.
- [x] Test `tests/unit/configuracion-ui/presentation-sheet.test.tsx`: abrir por crear y por editar
      no navega a otra URL ni monta diálogo centrado; edición llega precargada; `duplicate_name`
      pinta el error junto al campo y el panel sigue abierto con lo escrito; `invalid_input` va a la
      región de error; con éxito se cierra y se emite un toast; el formulario no captura ningún
      campo distinto de `name`.
- **Hecho cuando:** el test en verde.

### T8 [P] — `delete-presentation-dialog.tsx` *(depende de T4)*
- [x] `alert-dialog` que nombra la presentación, advierte que no se puede deshacer, con `<form>` e
      `id` oculto dentro del contenido.
- [x] Test `tests/unit/configuracion-ui/delete-presentation-dialog.test.tsx`: mientras no se
      confirma **no se invoca** la action (espía); el nombre aparece en el mensaje; al confirmar se
      invoca; con `presentation_in_use` el error se pinta **dentro** del diálogo, el diálogo sigue
      abierto y la fila sigue en la lista; con éxito se cierra y emite toast.
- **Hecho cuando:** el test en verde.

### T9 — Barrel de la ruta y convenciones *(depende de T4-T8)*
- [x] `components/index.ts` exporta todos los componentes de la ruta; `page.tsx` importa por el
      barrel.
- [x] Test `tests/unit/configuracion-ui/configuracion-convenciones.test.ts`: todos los componentes
      viven en `components/` y salen del barrel, sin imports profundos; ningún archivo de la ruta
      contiene el literal `'/configuracion/presentaciones'`; ningún `fetch` a rutas propias; ningún
      import de `lib/composition` ni del cliente de base de datos desde los componentes de cliente;
      `package.json` sin entradas nuevas; ningún test de la feature afirma sobre literales de copy
      (se comprueba que los `getBy*` de la carpeta usan rol, `data-testid` o constantes importadas).
- **Hecho cuando:** el test en verde.

## Bloque 5 — Plataforma y extremo a extremo

### T10 — Multiplataforma *(depende de T6, T7, T8)*
- [x] Test `tests/unit/configuracion-ui/configuracion-viewport.test.tsx` con
      `tests/helpers/viewport.ts`: lista, panel y diálogo son utilizables en angosto y en ancho; sin
      `100vh`; los botones de fila están en el DOM y visibles sin `:hover`; controles ≥ 44×44 px;
      inputs con fuente ≥ 16 px; el contenedor con `overflow-x-auto` es el envoltorio de la tabla y
      ningún ancestro de la pantalla lo declara.
- [ ] Comprobación manual en un WebKit real del scroll contenido en la tabla, anotada en
      `progress/impl_*.md`. **No es una casilla que se marque sola.**
- **Hecho cuando:** el test en verde y la comprobación manual anotada.

### T11 — E2E *(depende de T5-T8)*
- [x] `e2e/presentaciones.spec.ts` con fixtures `qc45_e2e_` y `RUN_ID`: (1) login →
      la pantalla → crear presentación → verla en la lista filtrando por su nombre; (2) sesión sin
      `inventario.modificar` → pide la URL → **404 dentro del layout privado** y no ve la tabla.
      Adaptado en la ronda 2: antes esperaba una redirección al dashboard, que era el
      comportamiento de la regla ruta→rol que QC-75 retiró; el `login` recibe además el aterrizaje
      esperado, porque desde QC-75 R11 el login lleva al primer ítem visible del menú y el Operador
      aterriza en `/inventario`, no en el dashboard.
- [x] Limpieza en `afterAll` que **tolera** `presentation_in_use` sin tumbar la suite.
- **Hecho cuando:** `pnpm exec playwright test e2e/presentaciones.spec.ts` en verde en Chromium y
      WebKit, sin dejar filas huérfanas. **Cumplido el 2026-09-08 sobre el spec de la ronda 2**:
      `--project=chromium --project=webkit` → `4 passed (47.5s)`, 0 rojos (salida en la bitácora).

### T12 — Cierre *(depende de todo)*
- [x] `progress/impl_QC-45-pantalla-de-presentaciones.md` con el mapa `R<n> -> test` de abajo,
      completo y con los comandos y su salida. Ronda 2 (2026-09-08) añadida al final, con la
      adaptación a QC-75 y la lista de requisitos desfasados.
- [ ] `./init.sh` completo en verde. **Pendiente del cierre humano:** en la ronda 2 se corrió
      `./init.sh --rapido` (typecheck ✓, lint ✓, todas las guardias ✓); el completo no se corrió
      porque `tests/integration/` está rojo por una base compartida, ajeno a esta ficha.
- **Hecho cuando:** las dos cosas, y ningún `R<n>` sin test.

## Mapa `R<n> -> test` (lo exige `CHECKPOINTS.md > Trazabilidad`)

| R | Test |
| --- | --- |
| R1 | `configuracion-ui/presentation-page.test.tsx` — la página existe en la ruta derivada de la constante y no declara `main` propio |
| R2 | `configuracion-ui/presentations-route-contract.test.ts` + `configuracion-convenciones.test.ts` (sin literales de la URL) |
| R3 | `configuracion-ui/private-nav-configuracion.test.ts` — una sección, un ítem, sin ítems a rutas sin pantalla + `tests/unit/app-sidebar.test.tsx` (orden exacto de `PRIVATE_NAV_ITEMS`) |
| R4 | `configuracion-ui/private-nav-configuracion.test.ts` (`filterNavItemsByPermissions` con `SEED_ROLE_PERMISSIONS`: Administrador sí, Operador no, sin encabezado huérfano) + `tests/unit/navegacion/private-layout-menu.test.tsx` (ampliación, sobre el árbol renderizado) |
| R5 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` + `presentations-route-contract.test.ts` (la constante está en `PRIVATE_ROUTE_PREFIXES` exactamente una vez) |
| R6 | `presentations-route-contract.test.ts` (`page.tsx` exige `inventario.modificar` con `requirePagePermission`, antes de leer `searchParams`, y el ítem de menú declara el mismo código) + `tests/guards/guard-pantallas-exigen-permiso.test.ts` + `e2e/presentaciones.spec.ts` (recorrido 2: 404 dentro del layout privado) |
| R7 | `presentation-page.test.tsx` — `unauthorized` pinta error y ninguna fila; la sección no lee sesión |
| R8 | `presentation-table.test.tsx` + `configuracion-convenciones.test.ts` (no hay tabla ni paginación propias) |
| R9 | `presentation-columns.test.tsx` — recorre la declaración; en negativo, ninguna columna prohibida |
| R10 | `presentation-table.test.tsx` — buscar navega; las filas se pintan tal cual llegan |
| R11 | `presentation-table.test.tsx` — ordenar navega; la columna de acciones no ordena ni filtra |
| R12 | `presentation-table.test.tsx` (10/25, defecto 10) + `presentation-list-params.test.ts` |
| R13 | `presentation-table.test.tsx` — anterior/siguiente e indicador de página |
| R14 | `presentation-list-params.test.ts` — entradas basura producen lista, nunca error |
| R15 | `presentation-page.test.tsx` — vacío con «crear la primera» y con enlace a la primera página |
| R16 | `presentation-page.test.tsx` — el esqueleto ocupa el lugar de la tabla |
| R17 | `presentation-page.test.tsx` — error con mensaje y reintento, nunca tabla vacía |
| R18 | `configuracion-viewport.test.tsx` — `overflow-x-auto` en el envoltorio de la tabla, acciones alcanzables |
| R19 | `presentation-columns.test.tsx` — los dos botones, con nombre accesible por presentación |
| R20 | `configuracion-ui/data-table-intacta.test.ts` — `components/shared/data-table/` sin cambios y sin prop nueva |
| R21 | `presentation-sheet.test.tsx` — panel, sin navegar y sin modal centrado; al cerrar conserva parámetros |
| R22 | `presentation-sheet.test.tsx` — solo el campo `name` |
| R23 | `presentation-sheet.test.tsx` — edición precargada y reemplazo completo |
| R24 | `presentation-sheet.test.tsx` — error por código, en línea, panel abierto y sin perder lo escrito |
| R25 | `presentation-sheet.test.tsx` + `delete-presentation-dialog.test.tsx` — cierre, toast y refresco |
| R26 | `tests/unit/private-layout.test.tsx` — exactamente **una** región de avisos en la zona privada |
| R27 | `delete-presentation-dialog.test.tsx` — nombra la presentación; sin confirmar no invoca |
| R28 | `delete-presentation-dialog.test.tsx` — `presentation_in_use` dentro del diálogo, que sigue abierto |
| R29 | `configuracion-convenciones.test.ts` — carpeta `components/` y barrel, sin imports profundos |
| R30 | `configuracion-convenciones.test.ts` — sin `fetch` propio; solo Server Actions del módulo |
| R31 | `tests/guards/guard-dependencias-aprobadas.test.ts` + `configuracion-convenciones.test.ts` (`package.json` sin entradas nuevas, `components/ui/` intacto) |
| R32 | `configuracion-convenciones.test.ts` — sin `lib/composition` ni cliente de base de datos en cliente |
| R33 | `data-table-intacta.test.ts` + la nota de **T0** en `progress/impl_*.md` |
| R34 | `configuracion-viewport.test.tsx` (angosto y ancho, 44×44, 16 px, sin `100vh`, sin `:hover`) |
| R35 | `configuracion-convenciones.test.ts` — los asserts de la carpeta usan rol, `data-testid` o constantes |
| R36 | `e2e/presentaciones.spec.ts` — recorridos 1 y 2 |
