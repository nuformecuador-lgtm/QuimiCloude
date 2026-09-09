# QC-39 — pantalla-de-unidades · tasks.md

> Cada task tiene **criterio de hecho** verificable. `[P]` = paralelizable con las de su mismo
> bloque. Se cierra cada tanda con `./init.sh --rapido` y la feature entera con `./init.sh`
> completo, **antes del PR, sin excepción** (regla 5 de `CLAUDE.md`).
>
> Nomenclatura: los unitarios de la pantalla viven en `tests/unit/configuracion-ui/` —la carpeta que
> QC-45 abrió para esta sección— y los del módulo en `tests/unit/unidades/`, donde ya están los de
> QC-32/QC-57/QC-76/QC-38.
>
> **El orden de los bloques 1 y 2 no es negociable.** El contrato de lectura va primero: si la
> pantalla se escribe antes, se escribe contra datos que no existen y la ampliación aparece a mitad
> de camino, que es exactamente el riesgo que esta ficha tiene declarado.

## T0 — Inventario de lo heredado (BLOQUEA todo lo demás)

- [x] Verificar en el worktree, **antes de escribir una línea**, que existen y funcionan: el layout
      privado con su `<main>` y su `<Toaster />`, `AppSidebar`, `PRIVATE_NAV_ITEMS` con la sección
      **Configuración ya creada**, `filterNavItemsByPermissions`, `requirePagePermission`,
      `components/shared/data-table/` con `cell: (row) => ReactNode`, las primitivas `table`,
      `sheet`, `alert-dialog`, `select`, `input`, `label`, `button`, `sonner`, `skeleton`, las
      **tres** Server Actions de escritura de `unidades`, `listUnitsAction`, `UNIT_QUERYABLE`,
      `isUnitPage`, `tests/helpers/viewport.ts` y Playwright.
- [x] Anotar en `progress/impl_QC-39-pantalla-de-unidades.md` la lista con su evidencia, y en
      particular **los archivos de `lib/modules/unidades/` que esta ficha PUEDE tocar** (los seis de
      `design.md > 1`) frente a los que no.
- **Hecho cuando:** la nota existe y **no se ha creado ni modificado** ninguno de esos archivos.
- **Por qué existe:** el choque entre las features 4 y 10 ya ocurrió una vez en este repo (R47), y
      aquí se suma el riesgo propio: entrar en un módulo `done` sin lista previa de lo tocable.

## Bloque 1 — El contrato de lectura (va ANTES que todo lo demás)

### T1 — `UnitView`: el tipo y la proyección *(depende de T0)*
- [x] `lib/modules/unidades/domain/unit-view.ts` **NUEVO**: `UnitView = UnitRef & { baseUnitId,
      factor: string | null, isSystem: boolean }`, con el porqué de cada campo (`design.md > 2.1`).
- [x] `unit-prisma.ts`: `UNIT_SELECT` gana `baseUnitId`, `factor` y `companyId`; `toUnitRef` pasa a
      `toUnitView` y deriva `isSystem = row.companyId === null` y `factor = row.factor?.toString() ??
      null`. **El `where`, el `orderBy`, el desempate, la búsqueda y el `count` no se tocan.**
- [x] `ports/unit-repository.ts` y `domain/list-units.ts`: **solo** los tipos de retorno
      (`UnitRef` → `UnitView`). El cuerpo de `createListUnits` **no cambia**.
- [x] `lib/modules/unidades/index.ts`: publica `type UnitView`. Nada más.
- [x] Test `tests/unit/unidades/unit-view-projection.test.ts`: la proyección incluye los seis campos
      y **no** más; una unidad de sistema sale con `isSystem: true` y una de empresa con `false`; el
      identificador de empresa **no** aparece en la salida; una unidad base sale con `baseUnitId` y
      `factor` **ambos** `null` y una derivada con **los dos** presentes; el factor es `string`.
- [x] Test `tests/unit/unidades/modulo-intacto.test.ts`: comparado con la rama base, **no cambian**
      `unit-catalog-prisma.ts`, `create-unit.ts`, `update-unit.ts`, `delete-unit.ts`,
      `unit-input.ts`, `errors.ts`, `actor.ts`, `unit-queryable.ts`, `convert-quantity.ts` ni
      `db/schema.prisma`; y `UNIT_QUERYABLE` sigue siendo `{ sortable: ['name','symbol','createdAt'],
      filterable: {}, searchable: true }`, afirmado sobre la constante importada.
- **Hecho cuando:** los dos tests en verde, `pnpm typecheck` en verde y los tests heredados de
      `tests/unit/unidades/` **siguen verdes sin editarlos** salvo para tensar un ancla.

### T2 — Abrir el parámetro de `listUnitsAction` *(depende de T1)*
- [x] `adapters/driving/unit-actions.ts`: `listUnitsAction` acepta la consulta y la pasa **tal cual**
      al caso de uso, con las dos sobrecargas de `design.md > 3`. `currentActor`, `toErrorState` y
      las tres actions de escritura **no se tocan**. Se retira el comentario que difería esto a
      QC-39 y se sustituye por lo que hace ahora.
- [x] Test `tests/unit/unidades/list-units-action.test.ts`: sin argumentos devuelve el catálogo
      (array) y llama al caso de uso con `undefined`; con `{ page, pageSize }` devuelve una página
      con `total` y `totalPages` y le pasa la consulta **sin traducir**; un error de dominio se
      traduce a `{ status:'error', code }` con el **código** de la clase; un error ajeno se relanza.
- [x] Test `tests/unit/unidades/consumidores-catalogo.test.tsx`: el selector de unidad del formulario
      de recetas y el del detalle de proveedor **renderizan con datos de `UnitView`** y sus archivos
      **no han cambiado** respecto a la rama base (R4).
- **Hecho cuando:** los dos tests en verde y `pnpm typecheck` en verde **sin haber editado ni un
      archivo de `app/(private)/produccion/` ni de `app/(private)/proveedores/`**.
- **Contingencia:** si el compilador de Server Actions rechazara las sobrecargas, se aplica el plan B
      de `design.md > 3` (una segunda action para la página) y se anota en `progress/impl_*.md`. No
      cambia ningún requisito.

## Bloque 2 — Ruta, protección y navegación (va ANTES que la página)

### T3 — Constante de ruta + prefijo privado + corte por permiso *(depende de T0)*
- [x] `lib/shared/routes.ts`: `UNITS_ROUTE = '/configuracion/unidades'` —la hermana que el
      comentario de `PRESENTATIONS_ROUTE` ya anuncia— y su entrada en `PRIVATE_ROUTE_PREFIXES`.
- [x] `tests/guards/guard-pantallas-exigen-permiso.test.ts`: **tensar** `RUTAS_ESPERADAS_HOY` de
      nueve a **diez** rutas, añadiendo `/configuracion/unidades`. Sin relajar ningún aserto.
- [x] Test `tests/unit/configuracion-ui/units-route-contract.test.ts`: la constante existe, está en
      los prefijos **exactamente una vez**, no está duplicada en ningún otro archivo, y la página
      exige **los dos** permisos con `requirePagePermission` **antes** de resolver `searchParams`
      (test de fuente, con los comentarios quitados antes de juzgar).
- **Hecho cuando:** `pnpm vitest run tests/unit/configuracion-ui tests/guards` en verde y
      `UNITS_ROUTE` no aparece como literal en ningún archivo de producto.
- **Nota:** va antes de T8 a propósito; con `page.tsx` y sin prefijo,
      `guard-rutas-privadas-cubiertas` pone el gate en rojo.

### T4 — El ítem de Unidades en la sección Configuración *(depende de T3)*
- [x] `private-nav.ts`: `UNITS_LABEL` y el ítem —`href: UNITS_ROUTE` importada, `testId:
      'nav-unidades'`, `permission: 'unidades.consultar'`, `icon` de los **ya declarados** en
      `NavIconName`, `section: NAV_SECTION_CONFIGURATION`—, **junto** al de presentaciones y sin
      tocarlo. No se crea sección, no se toca `NavLink`, no se toca
      `filterNavItemsByPermissions`, no se toca `AppSidebar`, no se toca `layout.tsx`.
- [x] Test `tests/unit/configuracion-ui/private-nav-unidades.test.ts`: hay **una** sección
      Configuración con **dos** ítems; el nuevo apunta a `UNITS_ROUTE` y su `permission` está
      **contenido en el conjunto que exige la página** (derivado de la fuente de `page.tsx`, no
      repetido como literal); con los permisos del Administrador (`SEED_ROLE_PERMISSIONS`
      importados) se ven los dos ítems, con los del Operador **ninguno** y la sección desaparece
      entera; ningún ítem de la sección apunta a una ruta sin `page.tsx` (comprobado en disco).
- [x] Test `tests/unit/configuracion-ui/permisos-unidades-coherentes.test.ts` (**el ancla de R11**):
      ningún rol de `SEED_ROLE_PERMISSIONS` tiene **exactamente uno** de `unidades.consultar` /
      `unidades.modificar`; el caso sintético contrario dispara.
- [ ] Ampliar `tests/unit/app-sidebar.test.tsx` y `tests/unit/navegacion/private-layout-menu.test.tsx`
      **tensando** sus anclas (de seis ítems a siete; el layout pinta `nav-unidades` con los permisos
      del Administrador y no con los del Operador).
- **Hecho cuando:** los tres tests en verde y `guard-nav-serializable` y
      `guard-nav-permisos-declarados` siguen verdes.

## Bloque 3 — Piezas puras (antes de la UI)

### T5 [P] — `unit-list-params.ts` *(depende de T3)*
- [x] `parseUnitListParams`, `buildUnitListQuery`, `unitListHref`, con `page`, `pageSize`, `sort` y
      `q`; `filters` **siempre `{}`**; campo de orden validado contra `UNIT_QUERYABLE.sortable`
      **importado**; `pageSize` contra `PAGE_SIZE_OPTIONS` y `DEFAULT_PAGE_SIZE` importados.
- [x] Test `tests/unit/configuracion-ui/unit-list-params.test.ts`: entradas basura (`'abc'`, `'0'`,
      `'-3'`, `'1.5'`, `'1e3'`, arrays, `pageSize=1000`, `sort=equivalencia:asc`,
      `sort=name:arriba`, `filters` inventados) producen siempre parámetros válidos y **nunca**
      lanzan; `parse(build(p))` devuelve `p`; `unitListHref` deriva de `UNITS_ROUTE`.
- **Hecho cuando:** el test en verde, sin montar DOM.

### T6 [P] — `unit-equivalence.ts` *(depende de T1)*
- [x] `formatFactor`, `unitLabel`, `formatUnitEquivalence` y la constante del marcador neutro
      (`design.md > 4`).
- [x] Test `tests/unit/configuracion-ui/unit-equivalence.test.ts`: `'1000.0000' -> '1000'`,
      `'0.5000' -> '0.5'`, `'1.2340' -> '1.234'`; una derivada con base resuelta produce la frase
      completa; una **base** produce el guion; una derivada **sin base resuelta** produce el marcador
      neutro y **no lanza**; una unidad sin símbolo se nombra por su nombre; en ningún camino se
      convierte el factor a `number` (test de fuente: ni `Number(`, ni `parseFloat`, ni `+factor`).
- **Hecho cuando:** el test en verde, sin montar DOM.

### T7 [P] — `unit-columns.tsx` + `unit-row-actions.tsx` *(depende de T1, T6)*
- [x] Las **cuatro** columnas de `design.md > 9`; acciones como columna normal (`pinnable: false`,
      sin `sortable`, sin `filter`).
- [x] `UnitRowActions` devuelve **nada** cuando `unit.isSystem`; en el resto, editar y borrar
      siempre visibles, `min-h-11 min-w-11`, con nombre accesible que incluye el nombre de la unidad.
- [x] Test `tests/unit/configuracion-ui/unit-columns.test.tsx`: recorre la declaración y afirma que
      hay exactamente cuatro columnas, que ninguna expone `id`, `companyId`, ámbito, `baseUnitId`
      suelto, `factor` suelto, `nameNormalized`, marcas de tiempo ni autoría; que solo `name` y
      `symbol` son ordenables; que la de equivalencia **no** ordena ni filtra y la de acciones
      tampoco; los dos botones existen y son alcanzables por rol ARIA en una fila de empresa; en una
      fila **de sistema** la celda no contiene **ningún** `button`, ningún `data-testid` de acción,
      ningún elemento `disabled` y ninguna insignia.
- [x] Test `tests/unit/configuracion-ui/data-table-intacta-unidades.test.ts`: ningún archivo de
      `components/shared/data-table/` ni de `components/ui/` fue modificado por esta feature
      (comparación con la rama base), y el barrel compartido no expone ninguna prop nueva de
      acciones de fila.
- **Hecho cuando:** ambos tests en verde.

## Bloque 4 — Página, sección y estados

### T8 — `page.tsx` + `unit-list-section.tsx` + los tres estados *(depende de T2, T3, T5, T6)*
- [x] `app/(private)/configuracion/unidades/page.tsx`: Server Component; **primeras** líneas
      `await requirePagePermission('unidades.consultar')` y `await
      requirePagePermission('unidades.modificar')`; `searchParams`; `<Suspense key={buildUnitListQuery(params)}>`;
      sin `main` ni armazón propio; título y metadata desde `UNITS_LABEL` y `BRAND_LABEL`
      importados.
- [x] Sección `async` con las **dos** lecturas de `design.md > 5.3` (`Promise.all`), el índice de
      bases y la lista de unidades base para el selector; despacha a error / vacío / tabla; **no lee
      sesión ni repite autorización**; si la segunda lectura falla, pinta la lista igual con índice
      vacío.
- [x] `unit-list-skeleton.tsx`, `unit-list-empty.tsx` (**de búsqueda sin resultados**: sin «crear la
      primera», con limpiar término y con enlace a la primera página) y `unit-list-error.tsx`
      (mensaje + reintento).
- [x] Test `tests/unit/configuracion-ui/unit-page.test.tsx`: la página existe en la ruta **derivada**
      de la constante; renderiza sin declarar `main`; sin sesión redirige y sin **cada uno** de los
      dos permisos responde 404 (los dos casos, por separado); con `status:'error'` sale el estado de
      error y **ninguna fila**; con `code:'unauthorized'` ídem; con `items: []` sale el vacío de
      búsqueda y **no** aparece ninguna acción de «crear la primera»; con término sale la acción de
      limpiarlo; con página > total sale el enlace a la primera; la carga muestra el esqueleto; si la
      segunda lectura falla, la tabla se pinta y las equivalencias derivadas caen al marcador neutro.
- **Hecho cuando:** el test en verde y `guard-rutas-privadas-cubiertas` y
      `guard-pantallas-exigen-permiso` siguen verdes.

### T9 — `unit-table.tsx` *(depende de T7, T8)*
- [x] Monta `<DataTable>` del barrel compartido con `tableId`, columnas, `getRowId`, `params`,
      `totalPages`, `status="idle"`, textos propios —la caja de búsqueda dice **por nombre**— y
      `onParamsChange -> router.push(unitListHref(next))`. **`searchable` ausente** (= `true`).
- [ ] Test `tests/unit/configuracion-ui/unit-table.test.tsx`: cambiar página, tamaño (10/25), orden
      de nombre y de símbolo, y término de búsqueda **navega** a la URL esperada; ordenar por
      equivalencia **no se ofrece**; no hay ningún control de filtro; el indicador de página y el
      selector de tamaño son los de la tabla compartida (`data-table-*`); las filas se pintan en el
      orden recibido y el término no filtra en cliente.
- **Hecho cuando:** el test en verde y no existe en la ruta ninguna tabla ni barra de paginación
      propias.

## Bloque 5 — Escrituras

### T10 [P] — `unit-sheet.tsx` + `unit-form.tsx` *(depende de T8)*
- [x] Panel lateral único para alta y edición; disparador de barra y disparador de fila; edición
      precargada con los **cuatro** valores y `updateUnitAction.bind(null, id)`.
- [x] Los **cuatro** campos; selector de «deriva de» con solo unidades base, opción «ninguna» y
      **sin** la propia unidad editada; factor como texto con `inputMode="decimal"`.
- [x] **Ausente ≠ vacío** (`design.md > 8`): cuando no se declara símbolo o no se declara derivación,
      esas claves **no se envían**.
- [x] Errores por **código**: `duplicate_name` → nombre, `duplicate_symbol` → símbolo,
      `invalid_derivation` → selector, el resto → región de error. Panel abierto, sin perder lo
      escrito.
- [x] Éxito: cerrar, `toast.success`, `router.refresh()`, sin perder los parámetros de la URL.
- [ ] Test `tests/unit/configuracion-ui/unit-sheet.test.tsx`: abrir por crear y por editar no navega
      a otra URL ni monta diálogo centrado; la edición llega precargada con los cuatro valores; el
      selector no ofrece derivadas ni la propia unidad y sí ofrece las bases de sistema; **el
      `FormData` enviado no tiene las claves `symbol`, `baseUnitId` ni `factor` cuando el usuario no
      las declara**, y nunca las envía como cadena vacía; cada código de error pinta donde le toca y
      el panel sigue abierto; con éxito se cierra y se emite un toast; el formulario no captura
      ningún campo fuera de los cuatro.
- **Hecho cuando:** el test en verde.

### T11 [P] — `delete-unit-dialog.tsx` *(depende de T7)*
- [x] `alert-dialog` que nombra la unidad, advierte que no se puede deshacer, con `<form>` e `id`
      oculto dentro del contenido.
- [ ] Test `tests/unit/configuracion-ui/delete-unit-dialog.test.tsx`: mientras no se confirma **no se
      invoca** la action (espía); el nombre aparece en el mensaje; al confirmar se invoca; con
      `unit_in_use` el error se pinta **dentro** del diálogo, que sigue abierto, y la fila sigue en
      la lista; con `system_unit` y con `unauthorized` ocurre lo mismo, distinguiéndolos por el
      código; con éxito se cierra y emite toast.
- **Hecho cuando:** el test en verde.

### T12 — Barrel de la ruta y convenciones *(depende de T7-T11)*
- [x] `components/index.ts` exporta todos los componentes de la ruta; `page.tsx` importa por el
      barrel.
- [ ] Test `tests/unit/configuracion-ui/unidades-convenciones.test.ts`: todos los componentes viven
      en `components/` y salen del barrel, sin imports profundos; ningún archivo de la ruta contiene
      el literal `'/configuracion/unidades'`; ningún `fetch` a rutas propias; ningún import de
      `lib/composition`, del cliente de base de datos ni de `lib/modules/unidades/domain/**` desde
      los componentes de cliente —solo el contrato público y los adaptadores driving—;
      `package.json` sin entradas nuevas; los `getBy*` de la carpeta usan rol, `data-testid` o
      constantes importadas y ninguno afirma sobre literales de copy.
- **Hecho cuando:** el test en verde.

## Bloque 6 — Plataforma y extremo a extremo

### T13 — Multiplataforma *(depende de T9, T10, T11)*
- [ ] Test `tests/unit/configuracion-ui/unidades-viewport.test.tsx` con `tests/helpers/viewport.ts`:
      lista de **cuatro** columnas, panel y diálogo utilizables en angosto y en ancho; sin `100vh`;
      los botones de fila están en el DOM y visibles sin `:hover`; controles ≥ 44×44 px; inputs con
      fuente ≥ 16 px; el contenedor con `overflow-x-auto` es el envoltorio de la tabla y ningún
      ancestro de la pantalla lo declara; la columna de equivalencia **no** provoca scroll del
      documento.
- [ ] Comprobación manual en un WebKit real del scroll contenido en la tabla, anotada en
      `progress/impl_*.md`. **No es una casilla que se marque sola.**
- **Hecho cuando:** el test en verde y la comprobación manual anotada.

### T14 — E2E *(depende de T8-T11)*
- [x] `e2e/unidades.spec.ts` con fixtures `qc39_e2e_` y `RUN_ID`: (1) login → la pantalla → crear una
      unidad **derivada** de una base existente → verla en la lista **con su equivalencia armada**;
      (2) sesión válida sin los permisos de unidades → pide la URL → **404 dentro del layout
      privado** y no ve la tabla. Navegación **por URL**, no pulsando el ítem del menú. El helper de
      login recibe el aterrizaje esperado (desde QC-75 R11 el login lleva al primer ítem visible).
- [x] Limpieza en `afterAll` que borra **primero las derivadas** y **tolera** `unit_in_use` sin
      tumbar la suite.
- **Hecho cuando:** `pnpm exec playwright test e2e/unidades.spec.ts` en verde en Chromium y WebKit,
      sin dejar filas huérfanas. Cierra el diferimiento que QC-38 dejó apuntando a esta ficha.

### T15 — Cierre *(depende de todo)*
- [ ] `progress/impl_QC-39-pantalla-de-unidades.md` con el mapa `R<n> -> test` de abajo, completo,
      con los comandos y su salida, y con la lista final de archivos ajenos tocados frente a la de
      `design.md > 1`.
- [ ] `./init.sh` completo en verde.
- **Hecho cuando:** las dos cosas, y ningún `R<n>` sin test.

## Mapa `R<n> -> test` (lo exige `CHECKPOINTS.md > Trazabilidad`)

| R | Test |
| --- | --- |
| R1 | `unidades/unit-view-projection.test.ts` — los seis campos, factor como texto, pareja base/factor junta o ausente |
| R2 | `unidades/unit-view-projection.test.ts` — `isSystem` derivado y el identificador de empresa **fuera** de la salida |
| R3 | `unidades/modulo-intacto.test.ts` — `findRefs`, escrituras, esquemas, errores y esquema Prisma sin cambios |
| R4 | `unidades/consumidores-catalogo.test.tsx` + `pnpm typecheck` — recetas y proveedores compilan y renderizan sin tocarse |
| R5 | `unidades/list-units-action.test.ts` — sin argumentos catálogo, con consulta página, consulta pasada sin traducir |
| R6 | `unidades/modulo-intacto.test.ts` (`UNIT_QUERYABLE` intacto) + los tests heredados de `list-units` y `unit-prisma`, que siguen verdes |
| R7 | `configuracion-ui/unit-page.test.tsx` — la página existe en la ruta derivada de la constante y no declara `main` propio |
| R8 | `configuracion-ui/units-route-contract.test.ts` + `unidades-convenciones.test.ts` (sin literales de la URL) |
| R9 | `configuracion-ui/private-nav-unidades.test.ts` — una sección, dos ítems, el de presentaciones intacto + `tests/unit/app-sidebar.test.tsx` (ancla tensada) |
| R10 | `configuracion-ui/private-nav-unidades.test.ts` (permiso del ítem contenido en el de la página, `filterNavItemsByPermissions` con `SEED_ROLE_PERMISSIONS`) + `tests/unit/navegacion/private-layout-menu.test.tsx` |
| R11 | `configuracion-ui/permisos-unidades-coherentes.test.ts` — ningún rol con uno solo de los dos permisos |
| R12 | `configuracion-ui/units-route-contract.test.ts` (los dos `requirePagePermission`, antes de `searchParams`) + `unit-page.test.tsx` (404 por cada permiso ausente) + `tests/guards/guard-pantallas-exigen-permiso.test.ts` + `e2e/unidades.spec.ts` (recorrido 2) |
| R13 | `tests/guards/guard-rutas-privadas-cubiertas.test.ts` + `units-route-contract.test.ts` (la constante está en los prefijos exactamente una vez) |
| R14 | `unit-page.test.tsx` — `unauthorized` pinta error y ninguna fila; la sección no lee sesión |
| R15 | `unit-table.test.tsx` + `unidades-convenciones.test.ts` (no hay tabla ni paginación propias) |
| R16 | `unit-columns.test.tsx` — recorre la declaración; en negativo, ninguna columna prohibida |
| R17 | `unit-equivalence.test.ts` — frase, guion, marcador neutro, factor sin ceros de relleno, nunca `number` |
| R18 | `unit-table.test.tsx` — buscar navega y no filtra en cliente; el texto del buscador es el de nombre |
| R19 | `unit-columns.test.tsx` (solo `name` y `symbol` ordenables) + `unit-table.test.tsx` (ordenar navega) + `unit-list-params.test.ts` (campo fuera de la lista blanca → sin orden) |
| R20 | `unit-list-params.test.ts` (`filters` siempre `{}`) + `unit-table.test.tsx` (ningún control de filtro) |
| R21 | `unit-table.test.tsx` (10/25, defecto 10) + `unit-list-params.test.ts` |
| R22 | `unit-table.test.tsx` — anterior/siguiente e indicador de página |
| R23 | `unit-list-params.test.ts` — entradas basura producen lista, nunca error |
| R24 | `unit-page.test.tsx` — vacío de búsqueda, **sin** «crear la primera», con limpiar término y enlace a la primera página |
| R25 | `unit-page.test.tsx` — el esqueleto ocupa el lugar de la tabla |
| R26 | `unit-page.test.tsx` — error con mensaje y reintento, nunca tabla vacía |
| R27 | `unidades-viewport.test.tsx` — `overflow-x-auto` en el envoltorio de la tabla, acciones alcanzables, sin scroll del documento |
| R28 | `unit-columns.test.tsx` — los dos botones en filas de empresa, con nombre accesible por unidad |
| R29 | `unit-columns.test.tsx` — fila de sistema: celda sin botones, sin `disabled`, sin insignia |
| R30 | `delete-unit-dialog.test.tsx` — `system_unit` se presenta como cualquier otro error, sin comprobación propia; `unidades-convenciones.test.ts` (la pantalla no lee `isSystem` para decidir nada más que la celda) |
| R31 | `configuracion-ui/data-table-intacta-unidades.test.ts` — `components/shared/data-table/` sin cambios y sin prop nueva |
| R32 | `unit-sheet.test.tsx` — panel, sin navegar y sin modal centrado; al cerrar conserva parámetros |
| R33 | `unit-sheet.test.tsx` — exactamente los cuatro campos |
| R34 | `unit-sheet.test.tsx` — el `FormData` espiado no lleva las claves no declaradas, y nunca cadena vacía |
| R35 | `unit-sheet.test.tsx` — edición precargada con los cuatro valores y reemplazo completo |
| R36 | `unit-sheet.test.tsx` — el selector ofrece solo bases, incluye «ninguna», excluye la propia unidad y no valida la derivación |
| R37 | `unit-sheet.test.tsx` — cada código pinta donde le toca; panel abierto y sin perder lo escrito |
| R38 | `unit-sheet.test.tsx` + `delete-unit-dialog.test.tsx` — cierre, toast y refresco |
| R39 | `tests/unit/private-layout.test.tsx` — exactamente **una** región de avisos en la zona privada |
| R40 | `delete-unit-dialog.test.tsx` — nombra la unidad; sin confirmar no invoca |
| R41 | `delete-unit-dialog.test.tsx` — `unit_in_use` dentro del diálogo, que sigue abierto, y la fila no se retira |
| R42 | `delete-unit-dialog.test.tsx` — los demás códigos, distinguidos por código y no por texto |
| R43 | `unidades-convenciones.test.ts` — carpeta `components/` y barrel, sin imports profundos |
| R44 | `unidades-convenciones.test.ts` — sin `fetch` propio; solo Server Actions y contrato público |
| R45 | `tests/guards/guard-dependencias-aprobadas.test.ts` + `unidades-convenciones.test.ts` (`package.json` sin entradas nuevas) + `data-table-intacta-unidades.test.ts` (`components/ui/` intacto) |
| R46 | `unidades-convenciones.test.ts` — sin `lib/composition` ni cliente de base de datos en cliente |
| R47 | `modulo-intacto.test.ts` + `data-table-intacta-unidades.test.ts` + la nota de **T0** en `progress/impl_*.md` + las anclas tensadas de `guard-pantallas-exigen-permiso`, `app-sidebar` y `private-layout-menu` |
| R48 | `unidades-viewport.test.tsx` (angosto y ancho, 44×44, 16 px, sin `100vh`, sin `:hover`) |
| R49 | `unidades-convenciones.test.ts` — los asserts de la carpeta usan rol, `data-testid` o constantes |
| R50 | `e2e/unidades.spec.ts` — recorridos 1 y 2 |
