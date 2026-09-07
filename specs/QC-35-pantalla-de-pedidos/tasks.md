# QC-35 — pantalla-de-pedidos · tasks.md

Checklist del `frontend_dev`. Cada task dice **qué archivos toca** —el leader los usa para la
validación de conflicto de `AGENTS.md > Paralelismo`—, su **criterio de hecho** y los requisitos que
cierra. `[P]` marca lo que puede ir en paralelo con la task anterior por no compartir archivos. El
orden **no es negociable en T0–T3**: la guardia de rutas privadas pone el gate en rojo en cuanto
exista una `page.tsx` sin su prefijo.

**Regla transversal (R46):** ningún archivo de `lib/modules/**`, `db/**` ni `lib/composition/index.ts`
se abre. Si una task parece pedirlo, se **para y se avisa al leader**.

**Aviso de estado del repo:** `dev` arrastra hoy **dos errores de typecheck ajenos** (tests de
integración de QC-57 que crean usuarios sin `companyId`, obligatorio desde QC-47). **No se arreglan
aquí** y no se cuentan como fallo de esta feature.

**Recordatorio de gate** (`docs/verification.md`): el `frontend_dev` corre `pnpm run typecheck`,
`pnpm run lint` y `pnpm exec vitest related --run <sus archivos>`. `./init.sh --rapido` lo corre el
leader al cerrar cada tanda; `./init.sh` **completo**, al cerrar la feature y **antes del PR, sin
excepción**.

---

## T0 — Verificar lo heredado antes de escribir nada (BLOQUEA TODO)

- [x] **Toca:** nada (solo lectura).
- [x] **Se hereda montado y NO se re-crea** (R47): layout privado con `<Toaster />`, `AppSidebar` y
      `PRIVATE_NAV_ITEMS`, `NAV_SECTION_OPERATION`, el icono `clipboard-list` en `NavIconName`/
      `NAV_ICONS`, `PRIVATE_ROUTE_PREFIXES` con su guardia, `ROUTE_ROLE_RULES` con sus tres filas,
      `lib/shared/pagination.ts`, las primitivas `table`, `select`, `sheet`, `alert-dialog`,
      `dropdown-menu`, `sonner`, `button`, `input`, `label`, `skeleton` de `components/ui/`,
      **la tabla de datos compartida `components/shared/data-table/` entera con su barrel**,
      `@tanstack/react-table` ya aprobada, Vitest, Playwright y `tests/helpers/viewport.ts`.
- [x] Comprobar que las **seis** Server Actions de `pedidos` tienen la firma que declara
      `design.md > 4`, que se importan **por ruta exacta** (no por el barrel) y que
      `listRecipesAction` acepta `search` y `listUnitsAction` no recibe argumentos.
- [x] Comprobar los tres hechos de los que depende `design.md > 6`: `DataTableColumn.cell` devuelve
      `ReactNode`; `DataTableFilters` monta **siempre** la caja de búsqueda; `usePinnedColumns`
      arranca **siempre** vacío.
- [x] **Hecho cuando:** la lista está verificada por lectura y **no se ha creado ningún archivo**. Si
      algo falta o su firma no coincide, se **para y se reporta** (R47).

## T1 — Constante de ruta y prefijo privado (depende de T0)

- [x] **Toca:** `lib/shared/routes.ts`.
- [x] Añadir `ORDERS_ROUTE = '/pedidos'` con el comentario del patrón ya establecido (por qué vive
      aquí y no en `private-nav.ts`) y **sin** helper de detalle: no hay página de detalle.
- [x] Añadir `ORDERS_ROUTE` a `PRIVATE_ROUTE_PREFIXES`.
- [x] **Hecho cuando:** `pnpm run typecheck` pasa y `guard-rutas-privadas-cubiertas` sigue verde (si
      se queja de prefijo huérfano, T1 y T5 se cierran en la misma tanda). **R2, R4.**

## T2 — Ítem de navegación `[P]` (depende de T1)

- [x] **Toca:** `lib/shared/navigation/private-nav.ts`.
- [x] Exportar `ORDERS_LABEL` y añadir un `NavLink` de **nivel superior** en `NAV_SECTION_OPERATION`
      con `href: ORDERS_ROUTE`, `icon: 'clipboard-list'` (ya existe: no se añade icono) y
      `testId: 'nav-pedidos'`.
- [x] **Hecho cuando:** un test itera `PRIVATE_NAV_ITEMS` y encuentra el ítem afirmando sobre
      `ORDERS_ROUTE`, `ORDERS_LABEL` y el `testId`, **nunca sobre el literal del copy**. **R3, R44.**

## T3 — Regla ruta→rol (depende de T1)

- [x] **Toca:** `lib/composition/route-role-rules.ts`.
- [x] Añadir la cuarta fila `{ prefix: ORDERS_ROUTE, roles: [ADMIN_ROLE_NAME] }`, **reutilizando** el
      `ADMIN_ROLE_NAME` que el archivo ya importa. Ningún import nuevo de módulos.
- [x] **Hecho cuando:** hay test de que una sesión no-Administrador es redirigida fuera del prefijo y
      una Administrador pasa, y `guard-middleware-edge` sigue verde. **R5.**

## T4 — Las dos props que la tabla compartida no tiene (depende de T0)

- [x] **Toca:** `components/shared/data-table/data-table-types.ts`,
      `components/shared/data-table/data-table.tsx`,
      `components/shared/data-table/data-table-filters.tsx`,
      `components/shared/data-table/use-pinned-columns.ts`,
      `tests/unit/shared/data-table-filters.test.tsx`, `tests/unit/shared/data-table.test.tsx`.
- [x] `searchable?: boolean` (ausente = `true`): con `false`, `DataTableFilters` **no monta** el campo
      de búsqueda (`design.md > 6.2`). `DataTableTexts` **no se toca**.
- [x] `defaultPinnedColumns?: readonly string[]`: `usePinnedColumns` lo aplica **solo si no hay nada
      persistido** para ese `tableId`, dentro del efecto de restauración y **nunca en render**
      (`design.md > 6.3`).
- [x] **Hecho cuando:** hay casos nuevos para las dos props (con y sin ellas), **ningún test existente
      de `tests/unit/shared/data-table*` se modifica** y todos siguen verdes. Si hubiera que
      modificar uno, se **para y se avisa**. Queda anotado en el PR que esta feature cambia el
      componente de QC-55. **R19, R20.**

## T5 — Página, parser de parámetros y barrel (depende de T1)

- [x] **Toca:** `app/(private)/pedidos/page.tsx`,
      `app/(private)/pedidos/components/{index.ts,order-list-params.ts}`.
- [x] `page.tsx`: Server Component con `metadata` (marca importada de `private-nav`), `searchParams`
      como `Promise`, contenedor **sin landmark principal propio**, y `<Suspense>` con la `key`
      derivada de la consulta y el esqueleto de fallback.
- [x] `order-list-params.ts`: `parseOrderListParams` y `buildOrderListQuery`, **puros**, con la
      codificación de `design.md > 5`; `PAGE_SIZE_OPTIONS` importado de la tabla compartida y los
      conjuntos válidos importados del contrato de `pedidos` (`ORDER_STATUS_VALUES`,
      `ORDER_PRIORITY_VALUES`, `ORDER_QUERYABLE.sortable`). **Nunca** lee ni escribe `search`.
- [x] **Hecho cuando:** hay test unitario del parser (entrada inválida, fuera de rango, por encima del
      tope, campo de orden no declarado, valor de filtro desconocido → acotado o descartado, nunca
      error), test de ida y vuelta `parse(build(params)) === params`, test en negativo de `search`, y
      test de contrato que **deriva** la ruta esperada de `ORDERS_ROUTE` y comprueba que el archivo
      existe. **R1, R16, R17, R18, R20, R40.**

## T6 — Los tres estados de la lista (depende de T5)

- [x] **Toca:** `app/(private)/pedidos/components/{order-list-section.tsx,order-list-empty.tsx,
      order-list-error.tsx,order-list-skeleton.tsx,index.ts}`.
- [x] `OrderListSection`: Server Component `async`, **una sola** llamada a `listOrdersAction` con el
      `DataTableParams` completo, despacho a error / vacío / tabla, y caso «página que se quedó
      atrás» → enlace a la primera.
- [x] Vacío **propio de pedidos** con la acción de crear el primero; error con el mensaje devuelto y
      reintento; esqueleto con tantas filas como `pageSize`.
- [x] **Hecho cuando:** tres tests distinguen los tres estados por `data-testid` distintos; el de
      error comprueba que **no** se pinta una tabla vacía; y un test con `code: 'unauthorized'`
      comprueba que **no se muestra ni un dato**. **R6, R7, R21.**

## T7 — Columnas y tabla (depende de T4, T6)

- [x] **Toca:** `app/(private)/pedidos/components/{order-columns.tsx,order-status-badge.tsx,
      order-table.tsx,index.ts}`.
- [x] Las diez columnas de `design.md > 7`, como datos, **en un módulo de cliente**. Ordenables solo
      correlativo, estado, prioridad y fecha; filtros `select` de estado y prioridad y `dateRange` de
      fecha; `orderNumber` en `defaultPinnedColumns`; `actions` con `pinnable: false`.
- [x] `order-table.tsx`: monta `<DataTable searchable={false}>` con `status: 'idle'`, traduce
      `onParamsChange` a `router.push` con `buildOrderListQuery`, y **no ordena, filtra ni recorta
      nada en cliente**.
- [x] Correlativo con `formatOrderNumber`; receta/unidad por nombre con marcador cuando falten;
      motivo de cancelación con marcador de ausencia; cantidad y precio **tal cual**.
- [x] **Hecho cuando:** hay test en positivo de las columnas declaradas y en negativo de que ninguna
      es `total`, `createdBy` ni `updatedBy`; test de que solo las cuatro acordadas son ordenables;
      test del marcador de receta/unidad `null` que comprueba que **no** aparece el uuid; test de que
      cambiar orden/filtro/página navega con la consulta esperada; test de que la caja de búsqueda
      **no existe**; y test de que la columna del correlativo está fijada al montar. **R8, R9, R10,
      R11, R12, R13, R14, R15, R19, R20.**

## T8 — Acciones de fila y estados finales (depende de T7)

- [x] **Toca:** `app/(private)/pedidos/components/{order-row-actions.tsx,index.ts}`.
- [x] Editar, cancelar y borrar por fila, **siempre visibles** (nada tras `:hover`), área táctil
      ≥ 44×44 px. Con el pedido en estado final, los tres `disabled` con **motivo visible** y sin
      montar ningún diálogo.
- [x] **Hecho cuando:** hay test de que con un pedido `ENTREGADO` y con uno `CANCELADO` las tres
      acciones están deshabilitadas, el motivo es localizable por `data-testid` y **ninguna operación
      se invoca** (dobles que fallan si se les llama). **R23, R24.**

## T9 — Selectores de receta y de unidad `[P]` (depende de T5)

- [x] **Toca:** `app/(private)/pedidos/components/{recipe-picker.tsx,unit-select.tsx,index.ts}`.
- [x] `recipe-picker.tsx`: forma de `product-picker.tsx` —`Button` + `Input` del CLI, rebote,
      paginación dentro del desplegable—, búsqueda con `listRecipesAction({ page, pageSize, search })`
      y **ni un filtrado por texto sobre los items descargados**. Primera página **por props**.
- [x] `unit-select.tsx`: **no controlado**, campo `unitId`, unidades **por props**, `symbol` cuando
      existe y `name` cuando no, **sin opción vacía** y **sin alta de unidad**.
- [x] **Hecho cuando:** hay test de que escribir dispara la action con `search` (y no recorta el array
      en memoria), test de que se alcanza una receta que no está en la primera página, test de que el
      selector de unidad envía el id elegido, y test en negativo de que ninguno de los dos importa
      una action de creación. **R31, R32, R43.**

## T10 — Formulario y panel lateral (depende de T8, T9)

- [x] **Toca:** `app/(private)/pedidos/components/{order-field.tsx,order-form.tsx,order-sheet.tsx,
      index.ts}`.
- [x] `<form action>` + `useActionState` con el literal `{ status: 'idle' }` construido aquí;
      `updateOrderAction.bind(null, id)` en edición; validación previa con `createOrderSchema` /
      `updateOrderSchema` del **barrel** de `pedidos`.
- [x] Alta: los cinco campos de negocio y **nada más** —sin estado, sin motivo, sin correlativo, sin
      fecha, sin autoría—, prioridad con el defecto del contrato **preseleccionado y visible**.
      Edición: precarga y **reemplazo completo** más el estado, con `EDITABLE_STATUS_VALUES` (sin
      `CANCELADO`).
- [x] Cantidad y precio con `type="text"` + `inputMode="decimal"`; nunca `type="number"`.
- [x] Traducción de errores **por `code`** según la tabla de `design.md > 8`; el panel no se cierra
      con error y no pierde lo escrito. Éxito: cierra, `toast.success` sobre el `<Toaster />` heredado
      (**no se monta otro**) y `router.refresh()`, conservando los parámetros de lista.
- [x] **Hecho cuando:** hay tests de alta, de edición precargada con reemplazo completo, de que el
      alta **no** ofrece selector de estado, de que la edición **no** ofrece `CANCELADO`, de que no
      hay campo de fecha de solicitud, de `recipe_not_found` pintado junto al selector de receta, de
      éxito con toast, de que al cerrar el panel la URL conserva página/orden/filtros, y de que
      escribir `0.1005` llega a la action **como esa misma cadena**. Un test cuenta **una sola**
      región de avisos renderizando layout + pantalla. **R25, R26, R27, R28, R29, R30, R33, R34, R35,
      R36, R39.**

## T11 — Cancelación con motivo (depende de T8, T10)

- [x] **Toca:** `app/(private)/pedidos/components/{cancel-order-dialog.tsx,index.ts}`.
- [x] Diálogo propio con campo de motivo, `id` en oculto, validado con `cancelOrderSchema` del
      contrato. Confirmar deshabilitado mientras el motivo esté vacío.
- [x] **Hecho cuando:** hay test de que con motivo vacío **no** se invoca `cancelOrderAction` (doble
      que falla si se le llama), de que con motivo se invoca **esa** action y ninguna otra, de que
      `not_cancellable` se pinta en la región del diálogo, y de que el éxito aplica T10. **R37, R35,
      R44.**

## T12 — Borrado `[P]` (depende de T8, T10)

- [x] **Toca:** `app/(private)/pedidos/components/{delete-order-dialog.tsx,index.ts}`.
- [x] Confirmación que **nombra el pedido por su correlativo** (`formatOrderNumber`, nunca el uuid) y
      advierte de que no se puede deshacer; `id` en oculto.
- [x] **Hecho cuando:** hay test de que sin confirmar **no** se invoca `deleteOrderAction`, de que al
      confirmar se invoca y se aplica el éxito de T10, y de que el texto de confirmación contiene el
      correlativo derivado del contrato y **no** el identificador técnico. **R38, R35.**

## T13 — Guardias de convención de la feature `[P]` (depende de T7, T10)

- [ ] **Toca:** `tests/unit/pedidos-ui/**` (archivos de test nuevos).
- [ ] Guardias de fuente: ningún archivo de la ruta contiene el literal `'/pedidos'`; ningún
      componente importa por ruta profunda saltándose el barrel de la ruta; las actions de `pedidos`
      se importan **por su ruta exacta y nunca por el barrel del módulo**; ningún archivo hace `fetch`
      a una ruta propia ni crea un route handler; ningún componente de cliente importa
      `lib/composition` ni el cliente de base de datos; no se edita ni se crea nada en
      `components/ui/`; `package.json` no cambia; no aparecen `parseFloat(`, `Number(` ni `toFixed(`
      sobre cantidad o precio, ni `type="number"` en esos campos.
- [ ] **Hecho cuando:** las guardias pasan y **fallan** si se introduce a propósito la violación que
      vigilan. **R2, R39, R40, R41, R42, R43, R46, R47.**

## T14 — Multiplataforma y desbordamiento `[P]` (depende de T7, T10)

- [ ] **Toca:** `tests/unit/pedidos-ui/pedidos-viewport.test.tsx` (nuevo).
- [ ] Con `tests/helpers/viewport.ts`, en angosto y en ancho: el desbordamiento se resuelve **dentro
      de la tabla** y no del documento; las acciones de fila siguen alcanzables; ningún control
      depende de `:hover`; controles ≥ 44×44 px; campos de formulario ≥ 16 px; sin `100vh`.
- [ ] Si las columnas angostas resultan inservibles por la deuda P2 de QC-55, se **para y se avisa**:
      la salida es una prop de ancho en el componente compartido y **la decide el humano**.
- [ ] **Hecho cuando:** los dos viewports pasan y la comprobación de P2 está anotada con su resultado.
      **R22, R45.**

## T15 — E2E (depende de T11, T12)

- [ ] **Toca:** `e2e/pedidos.spec.ts`.
- [ ] Recorrido 1: login → `ORDERS_ROUTE` → alta de pedido → verlo en la lista por su correlativo →
      cancelarlo con motivo → ver el motivo en su fila. Recorrido 2: sesión válida no-Administrador
      pide la URL y acaba fuera, sin ver datos.
- [ ] Fixtures con prefijo `qc35_e2e_` y `RUN_ID`, limpieza en `afterAll`, asserts filtrando por el
      correlativo y por el motivo con `RUN_ID` (nunca «la primera fila» ni totales).
- [ ] **Hecho cuando:** los dos recorridos pasan en Chromium y WebKit y la base queda limpia. **R48,
      R49.**

## T16 — Cierre y trazabilidad (depende de T13, T14, T15)

- [ ] **Toca:** `progress/impl_QC-35-pantalla-de-pedidos.md`.
- [ ] Volcar el mapa **`R1`–`R49` → test concreto** con los nombres reales
      (`CHECKPOINTS.md > Trazabilidad`), anotar los **dos cambios al componente compartido de QC-55**
      para que el PR los declare, y anotar cualquier desviación respecto de `design.md` en vez de
      silenciarla.
- [ ] **Hecho cuando:** `./init.sh` termina en verde —lo corre el **leader**—, los 49 requisitos
      tienen al menos un test nombrado y todas las tasks de este archivo están `[x]`.

---

## Mapa de trazabilidad previsto (`R<n> → test`)

| Req | Task | Archivo de test previsto |
| --- | --- | --- |
| R1 | T5 | `pedidos-ui/order-route-contract.test.ts`, `pedidos-ui/pedidos-page.test.tsx` |
| R2 | T1, T13 | `pedidos-ui/order-route-contract.test.ts` |
| R3 | T2 | `pedidos-ui/private-nav-pedidos.test.ts` |
| R4 | T1 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` (existente) + `pedidos-ui/order-route-contract.test.ts` |
| R5 | T3 | `pedidos-ui/route-role-pedidos.test.ts` |
| R6 | T6 | `pedidos-ui/order-list-section.test.tsx` (caso `unauthorized`) |
| R7 | T6, T7 | `pedidos-ui/order-table.test.tsx` |
| R8 | T7 | `pedidos-ui/order-columns.test.tsx` (positivo y negativo) |
| R9 | T7 | `pedidos-ui/order-columns.test.tsx` (marcador de `null`) |
| R10 | T7 | `pedidos-ui/order-columns.test.tsx` |
| R11 | T7 | `pedidos-ui/order-columns.test.tsx` |
| R12 | T7 | `pedidos-ui/order-columns.test.tsx` |
| R13 | T7 | `pedidos-ui/order-table.test.tsx` |
| R14 | T7 | `pedidos-ui/order-table.test.tsx` |
| R15 | T5, T7 | `pedidos-ui/order-table.test.tsx`, `pedidos-ui/order-list-params.test.ts` |
| R16 | T5 | `pedidos-ui/order-list-params.test.ts` |
| R17 | T5, T7 | `pedidos-ui/order-table.test.tsx` |
| R18 | T5 | `pedidos-ui/order-list-params.test.ts` |
| R19 | T4, T7 | `shared/data-table.test.tsx`, `pedidos-ui/order-table.test.tsx` |
| R20 | T4, T7 | `shared/data-table-filters.test.tsx`, `pedidos-ui/order-table.test.tsx` |
| R21 | T6 | `pedidos-ui/order-list-section.test.tsx` |
| R22 | T14 | `pedidos-ui/pedidos-viewport.test.tsx` |
| R23 | T8 | `pedidos-ui/order-row-actions.test.tsx` |
| R24 | T8 | `pedidos-ui/order-row-actions.test.tsx` |
| R25 | T10 | `pedidos-ui/order-sheet.test.tsx` |
| R26 | T10 | `pedidos-ui/order-form.test.tsx` |
| R27 | T10 | `pedidos-ui/order-form.test.tsx` |
| R28 | T10 | `pedidos-ui/order-form.test.tsx` |
| R29 | T10 | `pedidos-ui/order-form.test.tsx` + negativo en `order-row-actions.test.tsx` |
| R30 | T10 | `pedidos-ui/order-form.test.tsx` (negativo) |
| R31 | T9 | `pedidos-ui/recipe-picker.test.tsx` |
| R32 | T9 | `pedidos-ui/unit-select.test.tsx` |
| R33 | T10, T13 | `pedidos-ui/order-form.test.tsx`, `pedidos-ui/pedidos-convenciones.test.ts` |
| R34 | T10, T11 | `pedidos-ui/order-form.test.tsx`, `pedidos-ui/cancel-order-dialog.test.tsx` |
| R35 | T10, T11, T12 | `pedidos-ui/order-sheet.test.tsx`, `cancel-order-dialog.test.tsx`, `delete-order-dialog.test.tsx` |
| R36 | T10 | `pedidos-ui/order-sheet.test.tsx` (cuenta regiones de avisos) |
| R37 | T11 | `pedidos-ui/cancel-order-dialog.test.tsx` |
| R38 | T12 | `pedidos-ui/delete-order-dialog.test.tsx` |
| R39 | T10, T13 | `pedidos-ui/order-form.test.tsx`, `pedidos-ui/pedidos-convenciones.test.ts` |
| R40 | T5, T13 | `pedidos-ui/pedidos-convenciones.test.ts` |
| R41 | T13 | `pedidos-ui/pedidos-convenciones.test.ts` |
| R42 | T13 | `pedidos-ui/pedidos-convenciones.test.ts` + `tests/guards/guard-dependencias-aprobadas.test.ts` |
| R43 | T9, T13 | `pedidos-ui/pedidos-convenciones.test.ts` |
| R44 | T2, T11 | `pedidos-ui/private-nav-pedidos.test.ts`, `pedidos-ui/cancel-order-dialog.test.tsx` |
| R45 | T14 | `pedidos-ui/pedidos-viewport.test.tsx` |
| R46 | T13 | `pedidos-ui/pedidos-convenciones.test.ts` |
| R47 | T13 | `pedidos-ui/pedidos-convenciones.test.ts` |
| R48 | T15 | `e2e/pedidos.spec.ts` |
| R49 | T15 | `e2e/pedidos.spec.ts` |

Ningún requisito queda huérfano: R1–R49, sin saltos.

---

## Checklist de `CHECKPOINTS.md`: qué aplica «no aplica» (declararlo, no omitirlo)

- **Datos y seguridad (Supabase)** —tablas nuevas, columna de empresa, RLS + `FORCE`, migraciones con
  `down.sql`, secretos, webhooks—: **NO APLICA**. Esta feature no crea ni consulta ninguna tabla por
  su cuenta y no añade ninguna variable de entorno (`design.md > 11`).
- **«Cada permiso se valida en el SERVICE y tiene su test»**: **ya cumplido por QC-34**; esta ficha
  **no lo repite** y lo declara (R6).
- **«Páginas protegidas validan permisos en el servidor vía `cookies()`»**: **SÍ APLICA** (R4, R5).
- **«Componentes `private/` reciben datos por props»**: **SÍ APLICA** y es requisito duro (R43).
- **«Mutaciones internas usan Server Actions, no fetch a API routes»**: **SÍ APLICA** (R41).
- **Módulos hexagonales**: **NO APLICA** como trabajo propio; esta ficha no abre `lib/modules/**`
  (R46).
- **E2E de flujo crítico**: **SÍ APLICA** —permisos e importes— y tiene su task propia (T15).
- **Dependencias nuevas**: **ninguna** (`design.md > 12`). Si al implementar hiciera falta una, se
  **para**, se escriben los cuatro checks y se propone.

## Deudas y notas que esta feature deja registradas (no silenciosas)

- **Se modifica `components/shared/data-table/`** (dos props opcionales, `design.md > 6.2` y `> 6.3`).
  El PR lo declara: es cambio del componente de QC-55 y QC-56 lo hereda.
- **P1 de QC-55 queda resuelta sin tocar el componente** (`design.md > 6.1`): la columna de acciones
  es una columna normal cuyo `cell` devuelve `ReactNode`. Es lo que QC-56 adopta.
- **P2 (ancho de columna) y P3 (`focusColumnFilter` sin acotar) siguen abiertas** y se arrastran.
- **QC-68** —búsqueda por nombre de receta y columna de total— **no la espera esta ficha** y no se
  crea aquí la ficha de frontend que las enchufe.
- **P4 y P5 de `requirements.md`** (devolución de un entregado, exportación a contable externo) siguen
  abiertas y no se rellenan con supuestos (regla 6 de `CLAUDE.md`).
- Si durante la implementación aparece cualquier otra ambigüedad, el `frontend_dev` **para y la
  reporta al leader**.
