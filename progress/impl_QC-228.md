# QC-228 — bitácora de implementación (frontend_dev)

## Tanda 1 — T1 y T4

### Archivos
- `app/globals.css` (modificado): `--default-transition-duration` / `--default-transition-timing-function`
  en `@theme inline`; reglas de Sonner (entrada, salida y toast de atrás); regla global de
  `prefers-reduced-motion` del kit.
- `tests/unit/theme/color-tokens.test.ts` (modificado): R32 enmendado (`ENMIENDA QC-228 (D5)`);
  en R6, el localizador pasa de `--dur-instant` a `--dur-instant:` (misma enmienda: `@theme inline`
  ya nombra `var(--dur-instant)` y el localizador antiguo caía en él). Ninguna aserción de R6 cambia.
- `tests/unit/theme/motion-tokens.test.ts` (nuevo).

### Verificación del supuesto de `design.md > 1` (CSS compilado con `@tailwindcss/node` 4.3.3)
- `tw-animate-css` 1.4.0: `--animate-in: enter var(--tw-animation-duration,var(--tw-duration,.15s))var(--tw-ease,ease)…` → lee `--tw-duration` y `--tw-ease`. **Sí.**
- `duration-(--dur-slow)` compila a `--tw-duration: var(--dur-slow); transition-duration: var(--dur-slow)`;
  `ease-(--ease-enter)` a `--tw-ease: var(--ease-enter); …`. **Sí.**
- `zoom-in-96` → `--tw-enter-scale: calc(96*1%)`; `zoom-out-96` → `--tw-exit-scale: calc(96*1%)`. **Existen.**
- `transition-colors` / `transition-all` → `transition-duration: var(--tw-duration, var(--dur-instant))`, curva `var(--tw-ease, var(--ease-standard))`.
- P2: `animate-spin` es `animation: var(--animate-spin)` (shorthand con `infinite`); la longhand
  `animation-iteration-count: 1 !important` de la regla global lo pisa. No hace falta nada más.

### Mapa R → test
| R | Test |
| --- | --- |
| R3 | `motion-tokens.test.ts > R3: las transiciones sin duracion ni curva propias…` |
| R10 | `motion-tokens.test.ts > R10: toasts > *` (6 casos: regla de 500 ms de Sonner, entrada, salida incl. toast de atrás, especificidad sin `!important`, arrastre, ≤ 400 ms) |
| R21 | `motion-tokens.test.ts > R21: con movimiento reducido…` y `> R21: los indicadores de carga en bucle se detienen…` |
| R22 | `motion-tokens.test.ts > R22: la regla global no cambia el nombre de ninguna animacion…`; `color-tokens.test.ts > R32 (ENMIENDA QC-228)` |

### Salida de los comandos
- `pnpm run typecheck`: verde (antes hizo falta `prisma generate` y `next typegen` en el worktree: sin ellos, 978 errores ajenos de `@prisma/client` y `LayoutProps`).
- `pnpm run lint`: `✖ 7 problems (0 errors, 7 warnings)`, todos preexistentes (`confirm-catalog-import.test.ts`, `order-service.test.ts`).
- `pnpm exec vitest related --run app/globals.css tests/unit/theme/color-tokens.test.ts tests/unit/theme/motion-tokens.test.ts`: `Test Files 4 passed (4) · Tests 53 passed (53)`.
- `pnpm exec vitest run tests/unit/theme`: `Test Files 10 passed (10) · Tests 58 passed (58)`.

### Notas
- Sonner: además de lo de `design.md > 6`, las dos reglas excluyen `[data-swiping='true']` para no
  pisar el `transition: none` de Sonner al arrastrar (si no, el toast iría por detrás del dedo).
- No se tocó `[data-sonner-toast] > *` (`transition: opacity 400ms`): no supera 400 ms; queda fuera de `design.md > 6`.
- E2E (`login-skin.spec.ts`) no corrido en esta tanda por indicación del leader.

**Veredicto:** T1 y T4 hechas; supuesto de tw-animate verificado, tests de tema verdes.
