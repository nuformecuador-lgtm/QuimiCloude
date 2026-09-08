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

### T1 — Constante de ruta + prefijo privado + regla ruta→rol *(depende de T0)*
- [x] `lib/shared/routes.ts`: `PRESENTATIONS_ROUTE = '/configuracion/presentaciones'` con su
      comentario de por qué vive ahí, y su entrada en `PRIVATE_ROUTE_PREFIXES`.
- [x] `lib/composition/route-role-rules.ts`: fila
      `{ prefix: PRESENTATIONS_ROUTE, roles: [ROLE_ADMINISTRADOR] }` reutilizando el import ya
      presente.
- [x] Test `tests/unit/configuracion-ui/presentations-route-contract.test.ts`: la constante existe,
      está en los prefijos, tiene regla de rol, `findRouteRule` la resuelve a Administrador, y
      `guard-middleware-edge` sigue verde.
- **Hecho cuando:** `pnpm vitest run tests/unit/configuracion-ui tests/guards` en verde y
      `PRESENTATIONS_ROUTE` no aparece duplicada en ningún otro archivo.
- **Nota:** va antes de T5 a propósito; con `page.tsx` y sin prefijo, `guard-rutas-privadas-cubiertas`
      pone el gate en rojo.

### T2 — Sección Configuración y ocultado por rol *(depende de T1)*

> **NO SE IMPLEMENTA EN ESTA FICHA. Recorte de alcance, decisión humana del 2026-09-08.** QC-75
> (`menu-y-rutas-por-permiso`) está `in_progress` y reescribe `private-nav.ts`, `layout.tsx` y las
> reglas de ruta; T2 iría en dirección contraria (ocultado por ROL que QC-75 sustituye por ocultado
> por PERMISO). Es hoja del grafo: nada depende de ella. **Consecuencia: la pantalla NO está
> enlazada desde el menú.** R3 y R4 quedan sin cubrir y los hereda QC-75.

- [ ] `private-nav.ts`: `NAV_SECTION_CONFIGURATION`, `PRESENTATIONS_LABEL`, el ítem con
      `icon: 'boxes'`, `testId: 'nav-presentaciones'` y `adminOnly: true`; campo opcional
      `adminOnly` en `NavLink`; función pura `visibleNavItems`.
- [ ] `app/(private)/layout.tsx`: aplicar `visibleNavItems(PRIVATE_NAV_ITEMS, { isAdministrator:
      user.roleName === ROLE_ADMINISTRADOR })` al pasar los ítems a `AppSidebar`. **`AppSidebar` no
      se toca.**
- [ ] Test `tests/unit/configuracion-ui/private-nav-configuracion.test.ts`: hay **una** sección
      Configuración con **un** ítem que apunta a `PRESENTATIONS_ROUTE`; ningún ítem de esa sección
      apunta a una ruta sin `page.tsx`; con Administrador `visibleNavItems` devuelve la lista
      **íntegra**; sin Administrador desaparecen el ítem **y** la sección
      (`groupNavItemsBySection` no deja encabezado huérfano).
- [ ] Test en `tests/unit/private-layout.test.tsx` (ampliación, no reescritura): el layout pinta el
      ítem con sesión de Administrador y no lo pinta con otro rol.
- **Hecho cuando:** los dos tests en verde y `guard-nav-serializable` sigue verde.

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
      rol Administrador → pide la URL → acaba fuera y no ve la tabla.
- [x] Limpieza en `afterAll` que **tolera** `presentation_in_use` sin tumbar la suite.
- **Hecho cuando:** `pnpm exec playwright test e2e/presentaciones.spec.ts` en verde en Chromium y
      WebKit, sin dejar filas huérfanas.

### T12 — Cierre *(depende de todo)*
- [ ] `progress/impl_QC-45-pantalla-de-presentaciones.md` con el mapa `R<n> -> test` de abajo,
      completo y con los comandos y su salida.
- [ ] `./init.sh` completo en verde.
- **Hecho cuando:** las dos cosas, y ningún `R<n>` sin test.

## Mapa `R<n> -> test` (lo exige `CHECKPOINTS.md > Trazabilidad`)

| R | Test |
| --- | --- |
| R1 | `configuracion-ui/presentation-page.test.tsx` — la página existe en la ruta derivada de la constante y no declara `main` propio |
| R2 | `configuracion-ui/presentations-route-contract.test.ts` + `configuracion-convenciones.test.ts` (sin literales de la URL) |
| R3 | `configuracion-ui/private-nav-configuracion.test.ts` — una sección, un ítem, sin ítems a rutas sin pantalla |
| R4 | `configuracion-ui/private-nav-configuracion.test.ts` (`visibleNavItems`) + `tests/unit/private-layout.test.tsx` (ampliación) |
| R5 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` + `presentations-route-contract.test.ts` |
| R6 | `presentations-route-contract.test.ts` (`findRouteRule`) + `e2e/presentaciones.spec.ts` (recorrido 2) |
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
