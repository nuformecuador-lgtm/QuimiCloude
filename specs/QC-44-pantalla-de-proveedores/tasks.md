# QC-44 — pantalla-de-proveedores · tasks.md

Checklist del `frontend_dev`. Cada task dice **qué archivos toca**, su **criterio de hecho** y los
requisitos que cierra. `[P]` marca lo que puede ir en paralelo con la task anterior por no compartir
archivos. El orden **no es negociable en T0–T3**: la guardia de rutas privadas pone el gate en rojo
en cuanto exista una `page.tsx` sin su prefijo.

**Regla transversal (R49):** ningún archivo de `lib/modules/**`, `db/**` ni `lib/composition/index.ts`
se abre. Si una task parece pedirlo, se **para y se avisa al leader**.

---

## T0 — Verificar lo heredado antes de escribir nada

- [x] **Toca:** nada (solo lectura).
- [x] Comprobar que existen y funcionan: layout privado con `<Toaster />`, `AppSidebar` y
      `PRIVATE_NAV_ITEMS`, primitivas `table`, `select`, `sheet`, `alert-dialog`, `sonner`,
      `button`, `input`, `label`, `skeleton` en `components/ui/`, `tests/helpers/viewport.ts`,
      Playwright, `lib/shared/pagination.ts`.
- [x] Comprobar que las nueve Server Actions de `proveedores` tienen la firma que declara
      `design.md > 4`, y que `listUnitsAction` y `listPresentationsAction`/`createPresentationAction`
      existen.
- [x] **Hecho cuando:** la lista está verificada por lectura y **no se ha creado ningún archivo**. Si
      algo falta o su firma no coincide, se **para y se reporta** (R50).

## T1 — Constante de ruta, helper de detalle y prefijo privado

- [x] **Toca:** `lib/shared/routes.ts`.
- [x] Añadir `SUPPLIERS_ROUTE = '/proveedores'` y `supplierDetailRoute(id)` derivado de ella, con el
      comentario del patrón ya establecido (por qué vive aquí y no en `private-nav.ts`).
- [x] Añadir `SUPPLIERS_ROUTE` a `PRIVATE_ROUTE_PREFIXES` (**una sola** entrada: cubre la lista y el
      detalle por comparación de segmentos).
- [x] **Hecho cuando:** `pnpm run typecheck` pasa y `guard-rutas-privadas-cubiertas` sigue verde
      (todavía no hay `page.tsx`, así que el prefijo aún no tiene pantalla: si la guardia se queja de
      prefijo huérfano, T1 y T4 se cierran en la misma tanda). **R2, R3, R5.**

## T2 — Ítem de navegación

- [x] **Toca:** `lib/shared/navigation/private-nav.ts`.
- [x] Exportar `SUPPLIERS_LABEL` y añadir un `NavLink` de **nivel superior** en `NAV_SECTION_CHAIN`
      con `href: SUPPLIERS_ROUTE`, `icon: 'truck'` (ya existe en `NavIconName` y `NAV_ICONS`: no se
      añade icono nuevo) y `testId: 'nav-proveedores'`.
- [x] **Hecho cuando:** un test itera `PRIVATE_NAV_ITEMS` y encuentra el ítem afirmando sobre
      `SUPPLIERS_ROUTE`, `SUPPLIERS_LABEL` y el `testId`, **nunca sobre el literal del copy**. **R4,
      R47.**

## T3 — Regla ruta→rol (depende de T1)

- [x] **Toca:** `lib/composition/route-role-rules.ts`.
- [x] Añadir la tercera fila `{ prefix: SUPPLIERS_ROUTE, roles: [ADMIN_ROLE_NAME] }`, **reutilizando**
      el `ADMIN_ROLE_NAME` que el archivo ya importa. No añadir imports nuevos de módulos.
- [x] **Hecho cuando:** hay test de que una sesión no-Administrador es redirigida fuera del prefijo y
      una Administrador pasa, y `guard-middleware-edge` sigue verde. **R6.**

## T4 — Página de lista y parser de paginación (depende de T1)

- [x] **Toca:** `app/(private)/proveedores/page.tsx`,
      `app/(private)/proveedores/components/{index.ts,supplier-list-params.ts}`.
- [x] `page.tsx`: Server Component con `metadata` (marca importada de `private-nav`), `searchParams`
      como `Promise`, contenedor **sin landmark principal propio**, y `<Suspense key={page-pageSize}>`
      con el esqueleto de fallback.
- [x] `supplier-list-params.ts`: `parseSupplierListParams` y `buildSupplierListQuery`, puros,
      con `DEFAULT_PAGE_SIZE`/`MAX_PAGE_SIZE` **importados** de `lib/shared/pagination`.
- [x] **Hecho cuando:** hay test unitario del parser (entrada inválida, fuera de rango y por encima
      del tope → acotada, nunca error) y test de contrato que **deriva** la ruta esperada de
      `SUPPLIERS_ROUTE` y comprueba que el archivo existe. **R1, R8, R10, R42.**

## T5 — Los tres estados de la lista de proveedores (depende de T4)

- [x] **Toca:** `app/(private)/proveedores/components/{supplier-list-section.tsx,
      supplier-list-empty.tsx,supplier-list-error.tsx,supplier-table-skeleton.tsx,index.ts}`.
- [x] `SupplierListSection`: Server Component `async`, **una sola** llamada a `listSuppliersAction`,
      despacho a error / vacío / tabla, y caso «página que se quedó atrás» → enlace a la primera.
- [x] Estado vacío **propio de proveedores** con la acción de crear el primero; estado de error con
      mensaje devuelto y reintento; esqueleto con tantas filas como `pageSize`.
- [x] **Hecho cuando:** tres tests distinguen los tres estados por `data-testid` distintos, y el de
      error comprueba que **no** se pinta una tabla vacía. **R16, R17, R18, R7.**

## T6 — Tabla y toolbar de proveedores (depende de T5)

- [x] **Toca:** `app/(private)/proveedores/components/{supplier-columns.ts,supplier-table.tsx,
      supplier-list-toolbar.tsx,index.ts}`.
- [x] Columnas como datos: nombre, teléfono, correo, creado, actualizado. **Sin** creador ni
      modificador. Enlace al detalle con `supplierDetailRoute(id)`. Acciones de fila siempre
      visibles y con área táctil ≥ 44×44 px.
- [x] Desbordamiento con scroll horizontal **contenido en la tabla**, nunca del documento.
- [x] Toolbar: selector 10/25 y navegación de página con página actual y total.
- [x] **Hecho cuando:** hay test en negativo de que ninguna columna es `createdBy`/`updatedBy`, test
      de que el enlace del detalle sale del helper (no de un literal), test de viewport angosto y
      ancho con `tests/helpers/viewport.ts`, y test del cambio de tamaño de página. **R9, R11, R12,
      R13, R14, R15, R47, R48.**

## T7 — Promoción del selector de presentación `[P]`

- [x] **Toca:** `components/shared/presentation-select.tsx` (nuevo, contenido movido),
      `app/(private)/inventario/components/presentation-select.tsx` (borrado),
      `app/(private)/inventario/components/index.ts` (reexport desde la nueva ubicación), y los tests
      existentes que lo importen por ruta.
- [x] Mover **sin cambiar la API** (`defaultValue`, `error`, campo `presentationId`).
- [x] **Hecho cuando:** los tests de QC-22 que lo cubren siguen verdes desde la ubicación nueva y
      `product-form.tsx` **no cambia**. Si aparece conflicto con otra feature en vuelo, se **para y
      se avisa**: la salida documentada es `design.md > 13.B`. **R37, R38, R39.**

## T8 — Formulario y panel lateral del proveedor (depende de T4)

- [x] **Toca:** `app/(private)/proveedores/components/{supplier-field.tsx,supplier-form.tsx,
      supplier-sheet.tsx,index.ts}`.
- [x] `<form action>` + `useActionState` con el literal `{ status: 'idle' }` construido aquí;
      `updateSupplierAction.bind(null, id)` en modo edición; validación previa con
      `createSupplierSchema`/`updateSupplierSchema` del **barrel**.
- [x] Traducción de errores **por `code`** según la tabla de `design.md > 7`; el panel no se cierra
      con error y no pierde lo escrito.
- [x] Éxito: cierra el panel, `toast.success` sobre el `<Toaster />` heredado (**no se monta otro**) y
      `router.refresh()`; se vuelve a la lista con la misma página y tamaño.
- [x] **Hecho cuando:** hay tests de alta, de edición precargada con reemplazo completo, de error en
      línea junto al campo (`duplicate_name`) y de éxito con toast; y un test que renderiza layout +
      pantalla y cuenta **una sola** región de avisos. Campos con fuente ≥ 16 px. **R26, R27, R28,
      R32, R33, R34, R45, R46, R48.**

## T9 — Baja de proveedor con aviso de arrastre (depende de T6, T8)

- [x] **Toca:** `app/(private)/proveedores/components/{delete-supplier-dialog.tsx,index.ts}`.
- [x] Diálogo de confirmación que **nombra al proveedor**, avisa de que **sus líneas de catálogo se
      dan de baja con él** y de que no se puede deshacer. `id` en `input` oculto.
- [x] **Hecho cuando:** hay test de que sin confirmar **no** se invoca `deleteSupplierAction` (doble
      que falla si se le llama) y de que al confirmar se invoca y se aplica el éxito de T8. El aviso
      de arrastre se afirma por `data-testid`, no por copy. **R35, R33, R47.**

## T10 — Página de detalle y estado «no encontrado» (depende de T1)

- [x] **Toca:** `app/(private)/proveedores/[id]/page.tsx`,
      `app/(private)/proveedores/[id]/components/{index.ts,catalog-list-params.ts,
      supplier-detail-header.tsx,supplier-not-found.tsx}`.
- [x] `page.tsx`: resuelve `params`/`searchParams`, llama a `getSupplierAction`, despacha a
      `not_found` / error / detalle, pide **una vez** `listUnitsAction()` y lo baja por props, y
      envuelve el catálogo en su `<Suspense>` con `key`.
- [x] **Hecho cuando:** hay test de detalle correcto (nombre, teléfono, correo), test de `not_found`
      con vuelta a `SUPPLIERS_ROUTE` y sin catálogo, y test de `unauthorized` sin ningún dato. **R19,
      R20, R7, R46.**

## T11 — Diccionarios de presentación y unidad (depende de T10)

- [x] **Toca:** `app/(private)/proveedores/[id]/components/{catalog-directories.ts,index.ts}`.
- [x] Unidades desde `listUnitsAction()`; presentaciones recorriendo `listPresentationsAction` con
      `MAX_PAGE_SIZE` importado **hasta la cota declarada** `MAX_PRESENTATION_PAGES`. Una sola
      construcción por render de la sección, **nunca por fila**.
- [x] **Hecho cuando:** hay test de que un id presente se resuelve a nombre, de que un id ausente
      devuelve «no resuelto» (para que la celda pinte el marcador) y de que el número de llamadas
      está acotado. **R22.**

## T12 — Los tres estados del catálogo (depende de T10, T11)

- [x] **Toca:** `app/(private)/proveedores/[id]/components/{catalog-list-section.tsx,
      catalog-list-empty.tsx,catalog-list-error.tsx,catalog-table-skeleton.tsx,index.ts}`.
- [x] Vacío **distinto** del de la lista de proveedores, con la acción de añadir la primera línea;
      error con mensaje y reintento; esqueleto con tantas filas como `pageSize`.
- [x] **Hecho cuando:** un test afirma que el `data-testid` del vacío del catálogo **no** es el de la
      lista de proveedores, y los otros dos estados tienen su test. **R23, R24, R25.**

## T13 — Tabla y toolbar del catálogo (depende de T12)

- [x] **Toca:** `app/(private)/proveedores/[id]/components/{catalog-columns.ts,catalog-table.tsx,
      catalog-list-toolbar.tsx,index.ts}`.
- [x] Columnas: nombre, presentación (nombre), unidad (nombre o símbolo), costo, mínimo de compra,
      tiempo de entrega, creado, actualizado. **Sin** imagen y **sin** creador/modificador. Marcador
      identificable cuando el nombre no se resuelve; **nunca el uuid**.
- [x] Costo y mínimo pintados **tal cual** (cadena). Scroll horizontal contenido en la tabla.
      Toolbar 10/25 con navegación de página.
- [x] **Hecho cuando:** test del marcador (id fuera del diccionario), guardia de fuente de que no
      aparecen `parseFloat(`, `Number(` ni `toFixed(` sobre costo/mínimo, test en negativo de
      imagen y de autoría, y test de viewport angosto. **R8, R9, R11, R12, R13, R21, R22, R30, R41.**

## T14 — Selector de unidad (depende de T10)

- [x] **Toca:** `app/(private)/proveedores/[id]/components/{unit-select.tsx,index.ts}`.
- [x] No controlado, campo `unitId`, unidades **por props**, opción explícita «sin unidad» que envía
      cadena vacía, `symbol` cuando existe y `name` cuando no. **Sin alta de unidad.**
- [x] **Hecho cuando:** hay test de que se envía el id elegido, de que «sin unidad» envía vacío y en
      negativo de que el componente **no importa** ninguna action de creación de unidad. **R40,
      R46.**

## T15 — Formulario y panel lateral de la línea (depende de T7, T12, T14)

- [x] **Toca:** `app/(private)/proveedores/[id]/components/{catalog-line-form.tsx,
      catalog-line-sheet.tsx,index.ts}`.
- [x] Los **siete** campos: nombre, presentación (obligatoria, con `PresentationSelect` promovido),
      unidad (opcional), costo, mínimo, tiempo de entrega; `imagePath` **no se emite**; `supplierId`
      en oculto en el alta; `updateCatalogLineAction.bind(null, id)` en edición, **sin** posibilidad
      de cambiar de proveedor.
- [x] Costo y mínimo con `type="text"` + `inputMode="decimal"`; `deliveryTime` entero.
- [x] Errores por `code` (incluido `duplicate_catalog_line` junto al nombre); éxito con toast y
      `router.refresh()`.
- [x] **Hecho cuando:** hay test en negativo de que el formulario **no** ofrece ningún campo ni
      selector de artículo del inventario y **no** pide imagen; test de alta, de edición precargada
      con reemplazo completo de los siete campos, de `duplicate_catalog_line` en línea, y de que
      escribir `0.1005` llega a la action **como esa misma cadena**. **R26, R29, R30, R31, R32, R33,
      R37, R38, R41, R45.**

## T16 — Baja de línea (depende de T13, T15)

- [x] **Toca:** `app/(private)/proveedores/[id]/components/{delete-catalog-line-dialog.tsx,index.ts}`.
- [x] Diálogo que **nombra la línea** y advierte de que no se puede deshacer; `id` en oculto.
- [x] **Hecho cuando:** test de que sin confirmar no se invoca `deleteCatalogLineAction` y de que al
      confirmar se invoca y se refresca la lista. **R36, R33.**

## T17 — Guardias de convención de la feature `[P]` (depende de T6, T13)

- [ ] **Toca:** `tests/unit/proveedores/**` (archivos de test nuevos).
- [ ] Guardia de fuente: ningún archivo de las dos rutas contiene el literal `'/proveedores'`; ningún
      componente importa por ruta profunda saltándose el barrel; ningún archivo hace `fetch` a una
      ruta propia; ningún componente de cliente importa `lib/composition` ni `lib/shared/db`; no se
      edita ni se crea nada en `components/ui/`; `package.json` no cambia.
- [ ] **Hecho cuando:** las guardias pasan y **fallan** si se introduce a propósito la violación que
      vigilan. **R2, R3, R42, R43, R44, R45, R46, R49.**

## T18 — E2E (depende de T9, T16)

- [ ] **Toca:** `e2e/proveedores.spec.ts`.
- [ ] Recorrido 1: login → `SUPPLIERS_ROUTE` → alta de proveedor → detalle → alta de línea → la línea
      aparece en el catálogo. Recorrido 2: sesión no-Administrador pide la URL y acaba fuera.
- [ ] Fixtures con prefijo `qc44_e2e_` y `RUN_ID`, limpieza en `afterAll`, asserts filtrando por el
      nombre con `RUN_ID` (nunca «la primera fila» ni totales).
- [ ] **Hecho cuando:** los dos recorridos pasan en Chromium y WebKit y la base queda limpia. **R51,
      R52.**

## T19 — Cierre

- [ ] **Toca:** `progress/impl_QC-44-pantalla-de-proveedores.md`.
- [ ] Escribir el mapa **`R1`–`R52` → test concreto** (`CHECKPOINTS.md > Trazabilidad`) y anotar
      cualquier desviación respecto de `design.md` en vez de silenciarla.
- [ ] **Hecho cuando:** `./init.sh` termina en verde y todas las tasks de este archivo están `[x]`.
