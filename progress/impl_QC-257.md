# impl QC-257 — shell-rediseno

## T0 — Decisiones P1–P9 (aprobadas por el humano el 2026-10-10 con los valores propuestos)

| P | D | Decisión | Efecto en la implementación |
|---|---|---|---|
| P1 | D9 | Se edita `components/ui/sidebar.tsx` solo en sus cuatro literales | T2 tal cual |
| P2 | D10 | Sheet móvil: título «Menú», descripción «Navegación principal de QuimiCloude.» | T2 usa estos textos |
| P3 | D11 | Clientes pasa a `SquareUser` | T1 tal cual (tabla de R2 sin cambios) |
| P4 | D12 | Los tres botones de la cabecera miden 44 × 44 px | T4 `size-11` |
| P5 | D13 | La pastilla no cambia de forma, solo su icono | T3 tal cual |
| P6 | D14 | Plegado automático en tablet fuera de alcance | — |
| P7 | D15 | Orden de integración con QC-258/QC-244 lo decide el leader | No se espera; se sigue |
| P8 | D16 | «Close» en inglés de Sheet/Dialog fuera de alcance | — |
| P9 | D17 | Flecha también en el botón móvil, sin tablero nuevo | T4 tal cual |

## Archivos

(se completa al cerrar)

## Mapa R → test

(se completa al cerrar)

## Salida de los tests

(se completa al cerrar)

## T3 + T4 — Control de la barra (frontend_dev)

**Archivos:** `components/private/app-sidebar.tsx`, `app/(private)/components/sidebar-toggle.tsx`,
`tests/unit/shell/control-barra.test.tsx` (nuevo), `tests/unit/marca/sidebar-carril.test.ts`
(dos casos R39 con `ENMIENDA QC-257`; el de `SidebarTrigger` sin children no cambia).

| R | Test (`tests/unit/shell/control-barra.test.tsx` salvo nota) |
|---|---|
| R4 | `R4 pinta la flecha a la izquierda con la barra expandida y girada 180 grados en modo icono`; `sidebar-carril > R39 la pastilla del borde pinta la flecha sin girar…` |
| R5 | `R5 pinta la flecha a la derecha con el panel cerrado y a la izquierda con el panel abierto`; `sidebar-carril > R39 el control del encabezado pinta la flecha girada…` |
| R6 | `R6 gira el mismo icono, sin sustituirlo…` (pastilla) y `R6 gira el mismo icono del boton movil…` |
| R8 | `R8 conserva nombre, aria-expanded, aria-controls, data-testid y solo se muestra en ancho` / `… en angosto` |
| R9 | `R9 la cabecera pone el control y el isotipo a la izquierda, y tema y cerrar sesion a la derecha, los tres de contorno y 44 px` |

**Salida:**
- `pnpm run typecheck`: 9 errores, todos en `tests/unit/shell/nav-iconos.test.ts` (T1, otro agente en curso). Ninguno en archivos de T3/T4.
- `pnpm run lint`: 0 errores, 7 warnings preexistentes (documentos, pedidos).
- `vitest related` (mis 4 archivos): 19 archivos verdes, 1 rojo: `pedidos-ui/pedidos-viewport.test.tsx > R45` (2 casos) por `opacity-0` en `theme-toggle.tsx` (T6, otro agente). No viene de T3/T4.
- `sidebar-carril`, `sidebar-desktop`, `app-sidebar`, `sidebar-mobile`, `theme/private-header`, `sidebar-ajuste`, `control-barra`: 7 archivos, 70 tests verdes.
- `vitest run guard`: 69/71 verdes; `guard-editor-aislado` y `guard-convenciones-proveedores` rojos en la tanda completa y verdes aislados (11 passed, 3 skipped): intermitentes, ajenos a esta ficha.

**Veredicto T3+T4:** hecho; flecha única que gira en los dos controles y botón móvil `outline` 44 px, sin dependencias nuevas.

## T1 y T2 — frontend_dev (iconos del menú e idioma)

**Archivos:** `lib/shared/navigation/private-nav.ts`, `lib/shared/navigation/nav-icons.ts`,
`app/layout.tsx`, `components/ui/sidebar.tsx` (solo los cuatro literales),
`components/shared/CATALOGO.md` (fila `SidebarProvider`), `tests/unit/shell/nav-iconos.test.ts`,
`tests/unit/shell/idioma.test.tsx`, y enmiendas `ENMIENDA QC-257` en
`tests/unit/configuracion-ui/private-nav-usuarios.test.ts` y `private-nav-unidades.test.ts`.
Comentario limpiado: el que justificaba reutilizar `flask-conical` en Unidades.

**Mapa R → test**
- R1 → `nav-iconos.test.ts` › «R1: ningún destino del menú, de nivel superior o hijo, repite icono», «R1: ningún destino comparte el componente de icono con otro», «R1: cada icono declarado tiene fila en NAV_ICONS»
- R2 → `nav-iconos.test.ts` › «R2: %s se dibuja con %s» (12 filas), «R2: los hijos de Integraciones siguen sin icono», «R2: la tabla cubre todos los destinos del menú»
- R3 → `nav-iconos.test.ts` › «R3: etiqueta, ruta, testId, permiso, sección y orden no cambian»
- R14 → `idioma.test.tsx` › «R14: el html declara lang="es" %s» (sin preferencia, claro, oscuro)
- R15 → `idioma.test.tsx` › «R15: con el panel móvil abierto, su nombre es «Menú» y su descripción la de la navegación»
- R16 → `idioma.test.tsx` › «R16: el disparador sin children dice «Alternar barra lateral»…», «R16: el carril lleva aria-label y title en español», «R16: ningún texto, aria-label ni title del primitivo dice «Toggle Sidebar»»

**PARADA (fuera de la lista cerrada de `design.md > 9`, no enmendado):**
`tests/unit/clientes-ui/private-nav-clientes.test.ts:73` fija `icon` de Clientes en `'contact'`;
con D11 (`square-user`) queda rojo. Necesita una enmienda `ENMIENDA QC-257` que autorice el leader.

**Salida (2026-10-10)**
- `pnpm run typecheck`: verde.
- `pnpm run lint`: 0 errores, 7 avisos preexistentes en `confirm-catalog-import.test.ts` y `order-service.test.ts`.
- `pnpm exec vitest run guard`: 71 archivos, 977 pasan, 18 omitidos.
- `pnpm exec vitest related --run <archivos de T1/T2>`: 122 archivos, 3 rojos: `private-nav-clientes` (arriba) y los dos casos R45 de `tests/unit/pedidos-ui/pedidos-viewport.test.tsx`, que rechazan `opacity-0` en el `MoonIcon`: vienen del cambio de T6 en `theme-toggle.tsx` (otro agente), no de T1/T2.
- Tests propios y enmendados: 4 archivos, 49 pasan.

**Veredicto T1/T2:** hechas; bloqueadas en verde por la enmienda de `private-nav-clientes` que decide el leader.

## T5 y T6 — frontend_dev (tooltips de la cabecera; sol y luna)

**Archivos:** `app/(private)/components/theme-toggle.tsx`, `app/(private)/components/logout-button.tsx`,
`app/(private)/layout.tsx` (grupo de la derecha dentro de `TooltipProvider`; comentario de esas
líneas limpiado), `tests/unit/shell/cabecera-tooltips.test.tsx` y `tests/unit/shell/tema-sol-luna.test.tsx`
(nuevos). Sin dependencias nuevas; `Tooltip` reutilizado de `components/ui/tooltip.tsx`.

**Desviación de `design.md > 5` (Cerrar sesión):** el disparador del tooltip es el `<form>`
(`TooltipTrigger render={<form action={logoutAction} …/>}`), no el botón. Con el botón como
disparador, `tests/unit/logout-button.test.tsx` (R20/R21 de QC-11) quedaba rojo: medido en
vitest, cualquier re-render que el estado del tooltip provoca dentro del formulario devuelve
`pending` de `useFormStatus` a `false` con el envío aún en curso (sin proveedor, con toque o con
el tooltip aún cerrado al pulsar). Con el form como disparador el botón sigue siendo un
`<button type="submit">` con el mismo `aria-label`, `data-testid` y `useFormStatus`; el form no
gana rol ni `tabindex`, y es hermano directo del control de tema (lo exige
`theme/private-header.test.tsx`). El foco por Tab abre el tooltip igual (cubierto en unit).

| R | Test |
|---|---|
| R10 | `cabecera-tooltips` › «R10: con el puntero sobre «Cambiar tema» aparece debajo su tooltip…»; «R10, R11 y R12: con el teclado…» |
| R11 | `cabecera-tooltips` › «R11: con el puntero sobre «Cerrar sesión» aparece debajo…»; «R10, R11 y R12: con el teclado…» (dentro de la ventana a 390 px: E2E, T7) |
| R12 | `cabecera-tooltips` › «R12: al sacar el puntero del boton su tooltip se oculta»; «R10, R11 y R12: con el teclado…» |
| R13 | `cabecera-tooltips` › «R13: los dos botones conservan su nombre accesible», «R13: un clic en «Cambiar tema» sigue alternando el tema», «R13: un clic en «Cerrar sesión» sigue enviando su form y deja el boton deshabilitado…»; más `logout-button.test.tsx` y `theme/theme-toggle.test.tsx` sin tocar |
| R17 | `tema-sol-luna` › «R17: el sol se ve en claro y en oscuro gira 90°…», «R17: la luna entra en oscuro desde −90°…», «R17: los dos iconos animan giro, escala y opacidad con --dur-base y --ease-standard» |
| R18 | `tema-sol-luna` › «R18: el HTML del control es el mismo con preferencia clara y con oscura» |
| R19 | E2E (T7); la regla global de movimiento reducido no se toca |

**PARADA (fuera de la lista cerrada de `design.md > 9`, no enmendado):**
`tests/unit/pedidos-ui/pedidos-viewport.test.tsx` › «el disparador esta en el DOM y visible desde
el primer render, sin :hover (R45)» (2 casos, 375 y 1280 px) rechaza cualquier elemento con la clase
`opacity-0`; `design.md > 6` la pone en el `MoonIcon` (oculto por tema, no por puntero). Necesita una
enmienda `ENMIENDA QC-257` que autorice el leader.

**Salida (2026-10-10)**
- `pnpm run typecheck`: verde (0 errores).
- `pnpm run lint`: 0 errores, 7 avisos preexistentes (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest related --run <mis 5 archivos>`: 18 archivos, 275 pasan, 2 rojos: los R45 de `pedidos-viewport` (arriba).
- `pnpm exec vitest run tests/unit/theme tests/unit/logout-button.test.tsx`: 11 archivos, 69 pasan.
- `pnpm exec vitest run guard`: 71 archivos, 977 pasan, 18 omitidos.
- Nota: el worktree no tenía `node_modules`; se corrió `pnpm install --frozen-lockfile` (sin cambios en `package.json` ni lockfile).

**Veredicto T5/T6:** hechas; bloqueadas en verde por la enmienda de `pedidos-viewport` que decide el leader.

## Pendiente del leader (design.md > 9: lista cerrada, no se enmienda sin el leader)

Tests fuera de la lista cerrada que quedan rojos con T1–T6 (`./init.sh` rápido sale verde porque
no los relaciona; `gate-completo` los vería):
1. `tests/unit/clientes-ui/private-nav-clientes.test.ts` > «hay un item de NIVEL SUPERIOR cuyo
   destino es CUSTOMERS_ROUTE»: fija `'contact'`; con D11 es `'square-user'`. Propuesta: enmienda
   `ENMIENDA QC-257`.
2. `tests/unit/pedidos-ui/pedidos-viewport.test.tsx` > R45 «el disparador esta en el DOM y visible
   desde el primer render, sin :hover» (375 y 1280 px): rechaza cualquier `opacity-0` en la
   pantalla; design.md > 6 se la pone a la luna (oculta por tema, no por puntero). Propuesta:
   enmienda que excluya el icono de tema de la cabecera.
