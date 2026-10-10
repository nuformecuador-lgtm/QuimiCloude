# QC-227 — componentes-con-la-nueva-marca · tasks.md

Implementa `frontend_dev`. Leyenda: `[P]` = puede ir en paralelo con las otras `[P]` de la misma
tanda. «Dep.» = tasks que tienen que estar hechas antes. Cada task acaba con `pnpm run typecheck`,
`pnpm run lint`, `pnpm exec vitest related --run <archivos tocados>` y
`pnpm exec vitest run guard` en verde, **salvo los snapshots de paridad**, que se regeneran todos
juntos en T9. Un commit por task.

**Antes de empezar:** P7 decide cuándo arranca el código (propuesta: con QC-228 mergeada en `dev`).
P1 decide si entra T8. Las demás preguntas tienen propuesta por defecto y no bloquean.

**Enmienda 2026-10-09:** se añade T12 (R31–R39), con P10–P15 abiertas y con propuesta por
defecto. Los archivos `components/ui/sidebar.tsx` y `components/private/app-sidebar.tsx` entran
en «Archivos esperados». Antes quedaban fuera para no chocar con QC-228; ahora ese choque ya no
existe, porque el código empieza con QC-228 en `dev` (T0).

## Tanda 0 — Punto de partida (leader)

- [ ] **T0. Sincronizar con `dev` y capturas «antes»** (P7; R29)
  - Con QC-228 ya mergeada en `dev`: `git merge origin/dev` en esta rama y
    `pnpm exec vitest run tests/unit/paridad` en verde **sin regenerar**.
  - Capturas «antes» con Playwright y el seed demo (QC-230), en claro, oscuro y móvil, en
    `_trabajo/marca/capturas-componentes-antes/`. La lista de pantallas está en `design.md > 9`.
  - **Hecho cuando:** la paridad está verde sobre el `dev` nuevo y hay un índice de capturas en
    `progress/features/QC-227.md`.

## Tanda 1 — Primitivos y piezas compartidas (Dep.: T0)

- [x] **T1 [P]. Badges de estado** (R1, R3–R6, R8, R9)
  - Variantes `success`, `warning`, `info` y `neutral`, y `destructive` con `subtle`/`text`, en
    `components/ui/badge.tsx`, con el foco de `design.md > 7` (`design.md > 3`).
  - Mapas de tono en `order-status-badge.tsx` y `user-columns.tsx`; «En revisión» con `info` en
    `recipe-version-list.tsx` y `recipe-version-form.tsx`.
  - Test nuevo `tests/unit/marca/badges-estado.test.tsx`, con un caso por R en el nombre.
  - **Hecho cuando:** el test está verde y cada `Record` sigue siendo exhaustivo (sin `default`).

- [x] **T2 [P]. Cabecera de tabla y prop `tabular`** (R10, R11, R13)
  - `components/ui/table.tsx` (`bg-muted`, `text-muted-foreground`); columna fijada de la cabecera
    en `data-table-header-menu.tsx`; `tabular?: boolean` en `data-table-types.ts` y su clase en
    `data-table.tsx` y en `packing-orders-list-section.tsx` (`design.md > 4`).
  - Test nuevo `tests/unit/marca/tablas-marca.test.tsx`, con los casos del mecanismo (`td` sí y
    `th` no, cabecera y columna fijada).
  - **Hecho cuando:** el test está verde y los tests existentes de `DataTable` siguen verdes sin
    editar aserciones.

- [x] **T3 [P]. Barra lateral y contorno global** (R14–R17, R22)
  - En `app/globals.css`, la regla del ítem inactivo de `design.md > 5`, después del bloque del
    activo, y `outline-ring/50` → `outline-ring` en `@layer base`. Sin tocar la regla del activo
    ni su `::before`.
  - Test nuevo `tests/unit/marca/sidebar-inactivo.test.ts`.
  - **Hecho cuando:** el test está verde y `tests/unit/sidebar-ajuste.test.tsx`,
    `tests/unit/app-sidebar.test.tsx` y `tests/unit/theme/sidebar-panel.test.tsx` siguen verdes sin
    editar.

- [x] **T4 [P]. Botones, campos y foco en los primitivos** (R18–R25)
  - `components/ui/button.tsx` (base y `destructive`, conservando `btn-shine`, `btn-veil` y las
    clases de movimiento de QC-228), `input.tsx`, `textarea.tsx`, `select.tsx`, `autocomplete.tsx`,
    `checkbox.tsx`, `tabs.tsx` y `calendar.tsx` (`design.md > 6, 7`).
  - Comprobar en el CSS compilado (`pnpm run build` o el CSS de `next dev`) que el contorno sale
    con `outline-style: solid`. Si `outline-none` lo anula, añadir `focus-visible:outline-solid`.
  - Test nuevo `tests/unit/marca/botones-y-campos.test.tsx`.
  - **Hecho cuando:** el test está verde y ninguno de esos ocho archivos contiene `ring-ring/`.

- [x] **T5 [P]. Contraste de los pares de componentes** (R2, R10, R15, R18–R21, R23)
  - Test nuevo `tests/unit/marca/contraste-componentes.test.ts`, que reutiliza la conversión de
    `tests/unit/theme/color-tokens.test.ts`. Si no está exportada, se mueve a
    `tests/unit/theme/contraste.ts` sin cambiar su lógica, y `color-tokens.test.ts` la importa de ahí.
  - **Hecho cuando:** está verde en claro y en oscuro y `color-tokens.test.ts` sigue verde sin
    editar sus tablas esperadas (R27). Si algún par no llega, se para y se reporta: no se toca
    ningún token (D10).

- [x] **T8 [P]. Logo del login con precarga** (R26) — solo si P1 queda en «entra»
  - Leer la referencia de `<Image>` en `node_modules/next/dist/docs/` para elegir `preload` o
    `priority` (`design.md > 8`).
  - `preload` en `components/shared/brand-logo.tsx` y su uso en `app/(public)/login/page.tsx`.
  - Caso nuevo `R26` en `tests/unit/brand/brand-logo.test.tsx`.
  - **Hecho cuando:** el test está verde, `e2e/login-skin.spec.ts` sigue verde y el aviso de LCP de
    `next dev` ya no sale (se anota en `progress/impl_QC-227.md`).

- [x] **T12 (Dep.: T0, T3). Carril colapsado centrado y control de colapso** (R31–R39) — ENMIENDA 2026-10-09
  - Depende de T3 porque las dos tocan `app/globals.css`. No es `[P]` con T3; con las demás de la
    tanda, sí.
  - **Primero medir, sin cambiar nada.** Escribir el bloque «carril colapsado» de
    `e2e/marca-componentes.spec.ts` (`design.md > 16.3, 16.4`) y correrlo sobre el `dev` de T0.
    Debe salir rojo, con los botones a 32 px de ancho y 6 px a la izquierda del eje, y el isotipo a
    unos 16 px. Anotar las cajas medidas en `progress/impl_QC-227.md`. Si no salen esas cifras, se
    para y se reporta: el diagnóstico de `design.md > 16.1` no se sostiene.
  - **Control de colapso, también medido primero** (R38, R39, `design.md > 16.7`):
    - escribir el bloque «control de colapso» del mismo E2E y correrlo en rojo sobre el `dev` de
      T0;
    - debe salir el contraste de la pastilla con el puntero encima en modo claro (unos 1.3:1),
      y R39 en rojo (`PanelLeftIcon` fijo);
    - anotar las cifras en `progress/impl_QC-227.md`;
    - si el icono falla por otra causa (recorte, tamaño, tapado), se anota y se corrige esa
      causa, dentro de R38;
    - si el arreglo pide tocar un archivo que no está en «Archivos esperados», se para y se
      reporta.
  - Si `e2e/marca-componentes.spec.ts` nace en esta task, su alta en `E2E_ESPERADOS`
    (`tests/guards/guard-identificador-de-request.test.ts`) se adelanta aquí, para que las guardias
    sigan en verde. T10 añade el resto de casos al mismo archivo.
  - Hacer el cambio de `design.md > 16.2`:
    - `components/ui/sidebar.tsx`: `size-8!`/`p-2!` → `size-11!`/`p-3.5!`, solo con el prefijo del
      modo icono;
    - `components/private/app-sidebar.tsx`: `group-data-[collapsible=icon]:p-1.5!` en el enlace de
      marca;
    - `components/private/nav-user.tsx`: `group-data-[collapsible=icon]:justify-center` (P11);
    - `app/globals.css`: relleno a 14 px y comentario corregido (P12).
    - Control de colapso (`design.md > 16.7`):
      - pastilla: `PanelLeftOpenIcon`/`PanelLeftCloseIcon` según `open`, y colores del panel con
        `!` en reposo, con el puntero encima y con `aria-expanded`;
      - `SidebarTrigger` admite `children` (P13);
      - `sidebar-toggle.tsx` le pasa el icono según `isExpanded`.
  - Enmienda de `tests/unit/sidebar-ajuste.test.tsx`: solo la aserción `padding: 10px` → `14px`,
    con nota `ENMIENDA QC-227` (P12).
  - Test nuevo `tests/unit/marca/sidebar-carril.test.ts`. La lista congelada de R36 se copia del
    `dev` de T0.
  - **Hecho cuando:**
    - los bloques «carril colapsado» y «control de colapso» del E2E están verdes en Chromium y
      WebKit, en claro y en oscuro;
    - `sidebar-carril.test.ts` está verde;
    - `sidebar-ajuste.test.tsx` (con su enmienda), `sidebar-desktop.test.tsx`,
      `app-sidebar.test.tsx` y `theme/ui-primitivas-intactas.test.ts` están verdes;
    - `sidebar-active-indicator.tsx` no aparece en el diff.

## Tanda 2 — Pantallas (Dep.: T1, T2, T4)

- [x] **T6. Columnas de cifras y panel de lotes** (R7, R11, R12, R13)
  - `tabular: true` en las columnas de la lista cerrada de `design.md > 4.2` (12 archivos
    `*-columns.tsx`) y `font-mono tabular-nums` en las cuatro celdas de cifra de
    `order-ingredients-table.tsx`.
  - `product-batches-panel.tsx`: «Sobre-reservado» como `Badge variant="destructive"` (mismo testid)
    y los `<dd>` de lote, cantidades y fechas en Mono.
  - Casos nuevos en `tablas-marca.test.tsx`: la lista de cada archivo es **exactamente** la de
    `design.md > 4.2` (R11, R13) y los `<dd>` del panel (R12). Caso `R7` en `badges-estado.test.tsx`.
  - **Hecho cuando:** los tests están verdes y los tests existentes del panel y de esas pantallas
    siguen verdes sin editar aserciones.

- [x] **T7 (Dep.: T6). Foco en compuestos y rutas, y guardia** (R22–R24)
  - Foco opaco (campo o control, `design.md > 7`) en `shared-select.tsx`, `presentation-select.tsx`,
    `presentation-unit-select.tsx`, `date-picker.tsx`, `file-field.tsx`,
    `data-table/data-table-filters.tsx`, `responsible-avatars.tsx`, `product-field.tsx`,
    `execution-trace-columns.tsx` y `execution-trace-detail.tsx`.
  - Guardia nueva `tests/guards/guard-anillo-de-foco.test.ts`, con un caso negativo que demuestre
    que muerde.
  - **Hecho cuando:** `pnpm exec vitest run guard` está verde.

## Tanda 3 — Paridad, E2E y cierre

- [ ] **T9 (Dep.: T1–T8, T12). Snapshots de paridad y enmiendas** (R29)
  - `pnpm exec vitest run tests/unit/paridad`. Para cada `.snap` que cambie, comprobar que viejo y
    nuevo son idénticos quitando los `class="…"` (`design.md > 9`). Anotar el resultado por archivo
    en `progress/impl_QC-227.md`.
  - Regenerar con `-u` en el commit `test(QC-227): paridad con las clases de marca`, que no
    contiene nada más.
  - Enmiendas de la lista cerrada de `design.md > 9`, solo si fallan y solo la aserción de clase,
    con nota `ENMIENDA QC-227`, en un commit aparte.
  - **Hecho cuando:** la paridad está verde y ningún otro test cambió.

- [ ] **T10 (Dep.: T9). E2E y capturas «después»** (R10, R11, R15, R16, R21, R23, R24)
  - `e2e/marca-componentes.spec.ts` (`design.md > 11`), en claro y en oscuro; alta en
    `E2E_ESPERADOS` de `tests/guards/guard-identificador-de-request.test.ts`.
  - Correr `e2e/marca-componentes.spec.ts`, `e2e/theme.spec.ts`, `e2e/login-skin.spec.ts` y el
    E2E de QC-228 (`e2e/movimiento.spec.ts`), en Chromium y WebKit.
  - **El leader** saca las capturas «después» en `_trabajo/marca/capturas-componentes-despues/`, con
    la misma lista que T0, y deja la tabla de parejas en `progress/features/QC-227.md`.
  - **Hecho cuando:** los cuatro specs están verdes y cada captura «antes» tiene su pareja. Si la
    base local no responde, se anota la salida en `progress/impl_QC-227.md` como rojo de entorno.
  - Enmienda 2026-10-09: el bloque «carril colapsado» (R31–R36) lo escribe T12 dentro de
    `e2e/marca-componentes.spec.ts`. Aquí se corre con el resto. Las capturas de la barra en modo
    icono, antes y después, van en la tabla de parejas.

- [ ] **T11 (Dep.: T10). Cierre y trazabilidad** (D2, D7; R28)
  - `git diff --diff-filter=A --name-only origin/dev...HEAD -- components app` no lista ningún
    `.tsx` (D2), y `git diff --name-only origin/dev...HEAD -- lib/modules db` sale vacío (D7). Las
    dos salidas se anotan en `progress/impl_QC-227.md`.
  - Mapa `R<n> -> test` de R1–R30 en `progress/impl_QC-227.md`, y de R31–R39 (enmienda
    2026-10-09, `design.md > 16.4` y `16.7`).
  - `node scripts/archivos-en-vuelo.mjs --candidata QC-227` sin `CHOCA`, y `./init.sh` en verde.
  - **Hecho cuando:** cada R tiene un test, las dos comprobaciones de diff están anotadas y el gate
    local está verde.

## Archivos esperados

- `app/globals.css`
- `components/ui/badge.tsx`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/textarea.tsx`
- `components/ui/select.tsx`
- `components/ui/autocomplete.tsx`
- `components/ui/checkbox.tsx`
- `components/ui/tabs.tsx`
- `components/ui/calendar.tsx`
- `components/ui/table.tsx`
- `components/ui/sidebar.tsx`
- `components/private/app-sidebar.tsx`
- `components/private/nav-user.tsx`
- `app/(private)/components/sidebar-toggle.tsx`
- `tests/unit/marca/sidebar-carril.test.ts`
- `tests/unit/sidebar-ajuste.test.tsx`
- `components/shared/brand-logo.tsx`
- `components/shared/shared-select.tsx`
- `components/shared/presentation-select.tsx`
- `components/shared/presentation-unit-select.tsx`
- `components/shared/date-picker.tsx`
- `components/shared/file-field.tsx`
- `components/shared/responsible-avatars.tsx`
- `components/shared/data-table/data-table.tsx`
- `components/shared/data-table/data-table-types.ts`
- `components/shared/data-table/data-table-header-menu.tsx`
- `components/shared/data-table/data-table-filters.tsx`
- `app/(public)/login/page.tsx`
- `app/(private)/pedidos/components/order-status-badge.tsx`
- `app/(private)/pedidos/components/order-columns.tsx`
- `app/(private)/pedidos/components/order-ingredients-table.tsx`
- `app/(private)/configuracion/usuarios/components/user-columns.tsx`
- `app/(private)/configuracion/presentaciones/components/presentation-columns.tsx`
- `app/(private)/clientes/components/customer-columns.tsx`
- `app/(private)/produccion/formulas/components/recipe-columns.tsx`
- `app/(private)/produccion/formulas/components/recipe-version-list.tsx`
- `app/(private)/produccion/formulas/components/recipe-version-form.tsx`
- `app/(private)/proveedores/[id]/components/catalog-columns.tsx`
- `app/(private)/inventario/components/product-columns.tsx`
- `app/(private)/inventario/components/finished-stock-columns.tsx`
- `app/(private)/inventario/components/product-batches-panel.tsx`
- `app/(private)/inventario/components/product-field.tsx`
- `app/(private)/asignacion/components/company-orders-columns.tsx`
- `app/(private)/asignacion/components/finished-orders-columns.tsx`
- `app/(private)/asignacion/components/conditioning-orders-columns.tsx`
- `app/(private)/asignacion/components/packing-orders-columns.tsx`
- `app/(private)/asignacion/components/packing-orders-list-section.tsx`
- `app/(private)/dashboard/components/execution-trace-columns.tsx`
- `app/(private)/dashboard/recorrido/[id]/components/execution-trace-detail.tsx`
- `tests/unit/marca/badges-estado.test.tsx`
- `tests/unit/marca/tablas-marca.test.tsx`
- `tests/unit/marca/sidebar-inactivo.test.ts`
- `tests/unit/marca/botones-y-campos.test.tsx`
- `tests/unit/marca/contraste-componentes.test.ts`
- `tests/unit/theme/contraste.ts`
- `tests/unit/theme/color-tokens.test.ts`
- `tests/unit/brand/brand-logo.test.tsx`
- `tests/unit/shared-ui/button-touch.test.tsx`
- `tests/guards/guard-anillo-de-foco.test.ts`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/guards/guard-piezas-base.test.ts`
- `tests/guards/guard-formularios-y-acciones.test.ts`
- `tests/guards/guard-buscadores.test.ts`
- `tests/unit/paridad/__snapshots__/acciones-por-fila.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/asignacion-listas-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/asignacion-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/buscadores-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/campos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/catalogo-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/clientes-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/confirmaciones-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/error-alert-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/formularios-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/grupos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/inventario-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/login-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/order-form-image-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/pedidos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/presentaciones-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/proveedores-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/recetas-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/recorridos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/unidades-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/usuarios-paridad.test.tsx.snap`
- `e2e/marca-componentes.spec.ts`
- `progress/impl_QC-227.md`
- `tests/unit/pedidos-ui/order-columns.test.tsx`
- `tests/unit/login-skin.test.tsx`
- `tests/unit/shared-ui/motion-classes.test.tsx`
- `tests/unit/clientes/scope.test.ts` (T10: alta de `marca-componentes.spec.ts` en `E2E_PERMITIDOS`)
- `tests/unit/shared/data-table-alcance.test.ts` (T10: alta en la lista cerrada de E2E que referencian `data-table`)
