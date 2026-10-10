# QC-228 — movimiento-de-la-interfaz · tasks.md

Implementa `frontend_dev`. Verificación de cada tanda: `pnpm run typecheck`, `pnpm run lint`,
`pnpm exec vitest related --run <archivos>` y `pnpm exec vitest run guard`; E2E solo de los specs
tocados (`pnpm exec playwright test <spec>`). Un commit por task.

**Antes de empezar:** P1 (botones en oscuro) debe estar respondida para cerrar T3; P4 decide si
la fase 3 entra. Las demás preguntas tienen propuesta por defecto y no bloquean.

## Fase 1 — Duraciones, curvas y movimiento reducido (sin JavaScript nuevo)

- [x] **T1. Valores por defecto y regla global de movimiento reducido** (R3, R21, R22)
  - En `app/globals.css`: `--default-transition-duration` y `--default-transition-timing-function`
    en `@theme inline` (`design.md > 3`) y la regla global de `tokens.css` (`design.md > 7.2`).
  - Enmienda del caso `R32` de `tests/unit/theme/color-tokens.test.ts` con nota
    `ENMIENDA QC-228 (D5)`.
  - Test nuevo `tests/unit/theme/motion-tokens.test.ts` con casos `R3` y `R21`.
  - Comprobar con el CSS compilado (`pnpm run build` o el CSS de `next dev`) que
    `tw-animate-css` lee `--tw-duration` / `--tw-ease` (supuesto de `design.md > 1`). Si no, parar
    y avisar antes de T2.
  - **Hecho cuando:** los tests de tokens están verdes y `e2e/login-skin.spec.ts` sigue verde.

- [x] **T2 [P] (tras T1). Primitivos de `components/ui/` y chevron** (R4–R9, R11, R12)
  - Clases de `design.md > 4` en `dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`,
    `dropdown-menu.tsx`, `select.tsx`, `popover.tsx`, `autocomplete.tsx`, `tooltip.tsx`,
    `tabs.tsx` y `sidebar.tsx`; chevron de `components/private/app-sidebar.tsx`.
  - Verificar que `zoom-in-96` existe en `tw-animate-css` ^1.4; si no, `zoom-in-[0.96]`.
  - Test nuevo `tests/unit/shared-ui/motion-classes.test.tsx`, un caso por R.
  - **Hecho cuando:** ninguna de esas clases contiene `duration-100/150/200`, `ease-linear` ni
    `ease-in-out`, y los tests de esos componentes siguen verdes (salvo paridad, T6).

- [x] **T3 [P] (tras T1). Botones** (R16, R17, R18, R21)
  - `@utility btn-shine` y `btn-veil` y los tokens `--button-primary-gradient` /
    `--button-veil-color` en `:root` y `.dark` (este último según P1).
  - Variantes `default` y `outline` de `components/ui/button.tsx` (`design.md > 4.1`).
  - `components/shared/data-table/data-table-scroll-nav.tsx`: `active:not-aria-[haspopup]:scale-100`
    y `behavior: 'auto'` con movimiento reducido (`design.md > 7.2`).
  - Casos nuevos en `motion-classes.test.tsx`, `motion-tokens.test.ts` y
    `tests/unit/shared/data-table-scroll.test.tsx` (`R18`, `R21`).
  - Contraste: el texto del primario cumple 4.5:1 sobre las tres paradas del degradado, en claro y
    en oscuro (caso en `motion-tokens.test.ts`).
  - **Hecho cuando:** los casos nuevos y los existentes de `data-table-scroll.test.tsx` están verdes
    sin editar los existentes.

- [x] **T4 [P] (tras T1). Toasts** (R10)
  - Reglas de `design.md > 6` en `app/globals.css`; caso `R10` en `motion-tokens.test.ts`.
  - **Hecho cuando:** ninguna duración de Sonner calculada supera 400 ms (se comprueba en T9).

- [x] **T5 (tras T2, T3, T4). Guardia de movimiento** (R1, R2, R23)
  - `tests/guards/guard-movimiento.test.ts` (`design.md > 10`), con casos negativos que demuestren
    que detecta cada patrón prohibido.
  - **Hecho cuando:** `pnpm exec vitest run guard` está verde.

- [x] **T6 (tras T2, T3). Paridad y tests de clases** (R24)
  - Revisar el diff de `pnpm exec vitest run tests/unit/paridad` y, si solo cambian las clases
    previstas en `design.md > 8`, regenerar con `-u` en el commit
    `test(QC-228): paridad con las clases de movimiento`.
  - Ajustar `tests/unit/shared-ui/button-touch.test.tsx` solo si falla, y solo la aserción de clase.
  - **Hecho cuando:** la paridad está verde y el commit de snapshots no contiene otra cosa.

## Fase 2 — Entrada de pantalla

- [x] **T7. Clave de módulo y `ScreenEnter`** (R19, R20)
  - `lib/shared/navigation/nav-module.ts` con `navModuleKey` y su test
    `tests/unit/navegacion/nav-module.test.ts` (prefijo por segmentos, detalle del mismo módulo,
    ruta sin ítem).
  - `app/(private)/components/screen-enter.tsx`, exportado en `app/(private)/components/index.ts`;
    el layout privado envuelve `{children}` y le pasa los `href` (`design.md > 7.1`).
  - Keyframes y retardos en `app/globals.css`.
  - Test nuevo `tests/unit/screen-enter.test.tsx`: atributo presente al montar, ausente tras
    420 ms, presente de nuevo al cambiar de módulo, ausente al navegar dentro del módulo.
  - `tests/unit/private-layout.test.tsx` sigue verde sin editar aserciones.
  - **Hecho cuando:** los tests están verdes.

## Fase 3 — Ítem activo que se desliza (recortable por P4)

- [x] **T8. Indicador del ítem activo** (R13, R14, R15)
  - `components/private/sidebar-active-indicator.tsx` y su uso en
    `components/private/app-sidebar.tsx`; regla `[data-indicator-ready]` en `app/globals.css`
    (`design.md > 5`).
  - Test nuevo `tests/unit/sidebar-active-indicator.test.tsx` (misma lista, otra lista, sin
    activo, sin JavaScript).
  - `tests/unit/app-sidebar.test.tsx` y `tests/unit/sidebar-ajuste.test.tsx` siguen verdes sin
    editar aserciones.
  - **Hecho cuando:** los tests están verdes. Si P4 lo recorta, esta task no se hace y R13–R15 se
    sustituyen por el fundido de 200 ms antes de implementar.

## Cierre

- [x] **T9 (tras T1–T8). E2E de movimiento** (R4–R6, R10, R13–R15, R19–R22)
  - `e2e/movimiento.spec.ts`: duraciones y curvas calculadas de un diálogo, un `Sheet` y un toast
    al abrir y al cerrar; indicador sobre el ítem activo (expandido e icono); entrada de pantalla
    al cambiar de módulo y no dentro del módulo; todo con `emulateMedia({ reducedMotion: 'reduce' })`
    también. Alta en `E2E_ESPERADOS` de `tests/guards/guard-identificador-de-request.test.ts`.
  - Correr `e2e/movimiento.spec.ts` y `e2e/login-skin.spec.ts` (Chromium y WebKit).
  - **Hecho cuando:** los dos specs están verdes. Si la base local no responde, se anota la salida
    en `progress/impl_QC-228.md` como rojo de entorno.

- [x] **T10. Notas de enmienda y trazabilidad** (R24, R25)
  - Notas en `specs/QC-226-tema-y-marca-base/requirements.md` (R11 y R32).
  - Mapa `R<n> -> test` en `progress/impl_QC-228.md`.
  - `./init.sh` en verde.
  - **Hecho cuando:** cada R1–R25 tiene un test y el gate local está verde.

## Archivos esperados

- `app/globals.css`
- `app/(private)/layout.tsx`
- `app/(private)/components/index.ts`
- `app/(private)/components/screen-enter.tsx`
- `components/ui/alert-dialog.tsx`
- `components/ui/autocomplete.tsx`
- `components/ui/button.tsx`
- `components/ui/dialog.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/popover.tsx`
- `components/ui/select.tsx`
- `components/ui/sheet.tsx`
- `components/ui/sidebar.tsx`
- `components/ui/tabs.tsx`
- `components/ui/tooltip.tsx`
- `components/private/app-sidebar.tsx`
- `components/private/sidebar-active-indicator.tsx`
- `components/shared/data-table/data-table-scroll-nav.tsx`
- `lib/shared/navigation/nav-module.ts`
- `tests/guards/guard-movimiento.test.ts`
- `tests/guards/guard-identificador-de-request.test.ts`
- `tests/unit/theme/color-tokens.test.ts`
- `tests/unit/theme/motion-tokens.test.ts`
- `tests/unit/shared-ui/motion-classes.test.tsx`
- `tests/unit/shared-ui/button-touch.test.tsx`
- `tests/unit/shared/data-table-scroll.test.tsx`
- `tests/unit/navegacion/nav-module.test.ts`
- `tests/unit/screen-enter.test.tsx`
- `tests/unit/sidebar-active-indicator.test.tsx`
- `tests/unit/paridad/__snapshots__/asignacion-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/buscadores-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/catalogo-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/clientes-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/grupos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/inventario-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/login-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/presentaciones-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/pedidos-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/proveedores-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/recetas-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/unidades-paridad.test.tsx.snap`
- `tests/unit/paridad/__snapshots__/usuarios-paridad.test.tsx.snap`
- `e2e/movimiento.spec.ts`
- `specs/QC-226-tema-y-marca-base/requirements.md`
- `progress/impl_QC-228.md`
