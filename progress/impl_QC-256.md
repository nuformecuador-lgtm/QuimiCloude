# QC-256 — bitácora de implementación

## Tanda 1 — T1 (tokens) y T2 (Button) · frontend_dev

### Archivos
- `app/globals.css`: tokens `--status-neutral-*`, `--status-progress-*`, `--{success,warning,destructive,info}-border`, `--avatar-1…6` y `-text` en `:root` y `.dark`, con su `--color-*` en `@theme inline`; `@keyframes status-pulse`.
- `components/ui/button.tsx`: `default` h-9 px-3.5, `sm` h-8 px-3 text-[13px], `icon` size-9, `icon-sm` size-8, `xl` nueva, `touch: 'mobile'` (`max-md:min-h-11`).
- `components/shared/CATALOGO.md`: fila `Button` (tallas, `touch="mobile"`, `Diseño` `Botones.dc.html`).
- `tests/unit/shared-ui/tokens-rediseno.test.ts` (nuevo), `tests/unit/shared-ui/button-tallas.test.tsx` (nuevo).
- `tests/unit/shared-ui/button-touch.test.tsx` y `tests/unit/login-skin.test.tsx`: enmienda (h-8→h-9, size-8→size-9).

### R → test
| R | Test |
| --- | --- |
| R1, R2, R4, R5 | `tests/unit/shared-ui/button-tallas.test.tsx` |
| R3 | `button-tallas.test.tsx` y `button-touch.test.tsx` |
| R6, R15, R41 (tokens) | `tests/unit/shared-ui/tokens-rediseno.test.ts` |

### Salida de los comandos
- `tsc --noEmit`: exit 0 (antes hubo que correr `next typegen`: el worktree no tenía `.next/types`).
- `eslint`: 0 errores, 7 avisos previos ajenos.
- `vitest run` de los 4 tests de T1/T2: 4 archivos, 113 tests en verde.
- `vitest run guard`: 71 archivos, 977 en verde, 18 omitidos.
- `vitest related --run` de los archivos tocados: 283 archivos; 17 en rojo, todos de `tests/unit/paridad/`, 228 snapshots que no coinciden. La diferencia es solo la clase de talla del botón (h-8→h-9, px-2.5→px-3.5, size-8→size-9, h-7→h-8).

### Snapshots de paridad (resuelto, decisión del leader 2026-10-10)
- El cambio de talla lo aprobó el humano (D7). Los 17 `tests/unit/paridad/__snapshots__/*.snap` se
  regeneran con `vitest -u` (21 archivos, 376 tests en verde, 228 snapshots actualizados) en un
  commit propio, solo con los snapshots. Así se cumple la regla de `login-paridad` («el cambio de
  talla se aplica sobre el snapshot en su propio commit»), aunque con `-u` y no a mano, y con el
  control que sigue.
- Control: un script sobre `git diff -U0` compara cada línea quitada con la añadida. Fuera de
  `class` deben ser iguales, y dentro de `class` solo valen los cambios de § 2: `default`
  h-8 px-2.5→h-9 px-3.5; `sm` h-7 px-2.5 text-[0.8rem]→h-8 px-3 text-[13px]; `icon` size-8→size-9;
  `icon-sm` size-7→size-8. Resultado: 721 líneas correctas y 0 fuera del mapa.
- Enmienda a QC-231, QC-232 y QC-233 (las fichas que crearon esos snapshots) añadida en `design.md > 10`.

### Notas (desviaciones aceptadas por el leader)
- En `qc.css`, `--d-b` se declara dos veces en el tema claro (borde `oklch(0.86 0.06 27)` y, más abajo, la duración `200ms`). Se usa el color de design.md; el test toma la primera declaración. Aceptado.
- `gap-2` en `xl` (el `gap` de 8 px de `.b` en `qc.css`), que design.md no menciona. Aceptado.
