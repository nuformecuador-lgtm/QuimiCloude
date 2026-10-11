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

Producción: `lib/shared/navigation/private-nav.ts`, `lib/shared/navigation/nav-icons.ts`,
`components/private/app-sidebar.tsx`, `components/ui/sidebar.tsx` (solo 4 literales),
`components/shared/CATALOGO.md`, `app/layout.tsx`, `app/(private)/layout.tsx`,
`app/(private)/components/{sidebar-toggle,theme-toggle,logout-button}.tsx`.
Tests nuevos: `tests/unit/shell/{nav-iconos.test.ts,control-barra,cabecera-tooltips,tema-sol-luna,idioma}.test.tsx`,
`e2e/shell-rediseno.spec.ts`.
Enmendados (`ENMIENDA QC-257`): `tests/unit/marca/sidebar-carril.test.ts`,
`tests/unit/configuracion-ui/private-nav-{usuarios,unidades}.test.ts`, `e2e/marca-componentes.spec.ts`
y, autorizados por el leader fuera de la lista inicial, `tests/unit/clientes-ui/private-nav-clientes.test.ts`
y `tests/unit/pedidos-ui/pedidos-viewport.test.tsx` (R45, estrecha + caso de control).
Sin cambios en `package.json` (`git diff origin/dev -- package.json` vacío).

## Mapa R → test

| R | Test |
|---|---|
| R1, R2, R3 | `tests/unit/shell/nav-iconos.test.ts` |
| R4 | `tests/unit/shell/control-barra.test.tsx` «R4 …» + R39 de `sidebar-carril.test.ts` y `e2e/marca-componentes.spec.ts` |
| R5 | `control-barra.test.tsx` «R5 …» + R39 del encabezado en `sidebar-carril.test.ts` |
| R6 | `control-barra.test.tsx` «R6 …» (×2) + `e2e/shell-rediseno.spec.ts` «R6 la pastilla gira…», «R6 el control de la cabecera en 390 px…» |
| R7 | `e2e/shell-rediseno.spec.ts` «R7 al cargar e hidratar ninguna flecha gira sola» |
| R8 | `control-barra.test.tsx` «R8 …» (ancho y angosto) |
| R9 | `control-barra.test.tsx` «R9 …» |
| R10, R11, R12 | `tests/unit/shell/cabecera-tooltips.test.tsx` «R10…», «R11…», «R12…», teclado; E2E «R10 R11 con el puntero…» y «… con el teclado…» (escritorio y 390 px) |
| R13 | `cabecera-tooltips.test.tsx` «R13 …» (×3) |
| R14 | `tests/unit/shell/idioma.test.tsx` «R14…» + E2E «R14 html[lang=es]…» (login y privada) |
| R15, R16 | `idioma.test.tsx` «R15…», «R16…» |
| R17 | `tests/unit/shell/tema-sol-luna.test.tsx` «R17…» (×3) + E2E «R17 al pasar a oscuro el sol sale…» |
| R18 | `tema-sol-luna.test.tsx` «R18 …» |
| R19 | E2E «R19 la flecha y los iconos de tema llegan al estado final sin transición medible» |
| R20 | `tests/guards/guard-dependencias-aprobadas.test.ts` + `git diff origin/dev -- package.json` vacío |
| R21 | Enmiendas de `design.md > 9` (lista cerrada + 2 autorizadas) y suite de CI (`gate-completo`) |

## Salida de los tests

- Unit afectados (incluye todos los que fijan icono/clase tocados, aunque `init` rápido no los relacione):
  `vitest run` de 23 archivos → `Test Files 23 passed (23) · Tests 253 passed (253)`.
- `private-nav-clientes` + `pedidos-viewport` tras las enmiendas: 2 archivos, 33 tests en verde.
- E2E: `pnpm exec playwright test e2e/shell-rediseno.spec.ts e2e/marca-componentes.spec.ts` →
  `100 passed (4.6m)` (chromium y webkit). R38 con hover del control móvil sin enmendar: claro 7.16,
  oscuro 7.27 (sin hover 18.84 / 13.76). El worktree no tiene `.env`; se cargó el de la raíz.
- Riesgo anotado: `e2e/marca-componentes.spec.ts` guarda la sesión en `beforeAll` igual que el
  patrón que dio redirecciones a `/login?sesion=fin` en el spec nuevo (ya corregido allí). Pasó; no se tocó.

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

## Enmiendas autorizadas por el leader (2026-10-10)

Anotadas en design.md > 9 (tabla «Se enmiendan») y design.md > 5 (desviación).

1. `tests/unit/clientes-ui/private-nav-clientes.test.ts` > «hay un item de NIVEL SUPERIOR cuyo
   destino es CUSTOMERS_ROUTE»: icono `'contact'` → `'square-user'` (D11/P3), con nota
   `ENMIENDA QC-257`.
2. `tests/unit/pedidos-ui/pedidos-viewport.test.tsx` > R45 «el disparador esta en el DOM y visible
   desde el primer render, sin :hover»: enmienda estrecha. La comprobación vive en
   `comprobarQueNadaDependeDelPuntero(raiz, ancho)` y excluye del chequeo de `opacity-0`/`invisible`
   SOLO los `svg[aria-hidden="true"]` dentro de `button[aria-label=THEME_TOGGLE_LABEL]`. El chequeo
   de `hover:` que revela no tiene excepción. Caso nuevo «un opacity-0 fuera del boton de tema sigue
   haciendo fallar la comprobacion (R45, ENMIENDA QC-257)»: la pantalla real pasa; un `span.opacity-0`
   inyectado y un `svg[aria-hidden].opacity-0` dentro de otro botón hacen que la función lance.
3. Desviación aceptada (design.md > 5): el tooltip de «Cerrar sesión» se dispara desde el `<form>`
   y no desde el botón; desde el botón, un re-render del tooltip devolvía `pending` a `false`
   durante el envío y rompía `logout-button.test.tsx`. Botón, `aria-label`, `data-testid` y
   `useFormStatus` no cambian.

## T8 — Cierre (2026-10-10)

- `./init.sh --completo` (con el `.env` de la raíz cargado; el worktree no tiene `.env`):
  `Test Files 1 failed | 1120 passed (1121) · Tests 1 failed | 16843 passed | 139 skipped`. El único
  rojo era `tests/guards/guard-identificador-de-request.test.ts` (R21: lista cerrada de specs E2E).
  Se dio de alta `shell-rediseno.spec.ts` en ella, que es su punto de extensión, como hicieron
  QC-227/QC-228. Tras el alta: `1 passed (23 tests)`. Archivo fuera de la lista esperada: ese.
- `./init.sh` rápido: ver la salida de la tanda 2 en `progress/features/QC-257.md`.
