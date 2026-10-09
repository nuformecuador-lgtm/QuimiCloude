# QC-233 — componentizacion-buscadores · implementación

Rama `feature/QC-233-componentizacion-buscadores`, worktree `.worktrees/QC-233-componentizacion-buscadores`.
Implementer: 2026-10-08/09. Subagentes: `frontend_dev` (T0, T1, tanda 2, T3). Ninguna task `[BACK]`.

## Resultado de TA
Comprobación del leader (2026-10-08), anotada en `progress/features/QC-233.md > Decisiones`: QC-223
toca 92 archivos y ninguno está en `tasks.md > Archivos esperados`. P1 y P2 quedan sin efecto.

## Commits
| Commit | Task |
|---|---|
| `2e8d5d18` test(QC-233): congela la paridad de los buscadores | T0 (solo test y `.snap`, contra producción sin tocar) |
| `f48c23f7` chore: capturas antes y tanda 0 cerrada | T0b (índice en `progress/features/QC-233.md`) |
| `3c42879b` feat: AsyncAutocomplete gana el contrato de los buscadores | T1 |
| `398be052` refactor: ProductPicker delega | T2a |
| `ae6826ca` refactor: RecipePicker delega | T2b |
| `9c041957` refactor: PackagingSelect delega | T2c |
| `a8ff2750` refactor: ProductNamePicker delega | T2d |
| `06b21ea4` refactor: PresentationSelect delega | T2e |
| `cef4516e` docs: enmienda QC-35 §9.1 | T4 (P3 = sí) |
| `fd9d6ce5` test: guard-buscadores | T3 |

## Archivos
**Producción (modificados):**
- `components/shared/async-autocomplete.tsx`
- `app/(private)/produccion/formulas/components/product-picker.tsx`
- `app/(private)/pedidos/components/recipe-picker.tsx`
- `app/(private)/pedidos/components/packaging-select.tsx`
- `app/(private)/inventario/components/product-name-picker.tsx`
- `components/shared/presentation-select.tsx`

`hooks/use-async-paginated-options.ts` no se tocó. Diff de producción: 618 líneas añadidas, 1003 quitadas.

**Tests nuevos:**
- `tests/unit/paridad/buscadores-paridad.test.tsx` + `__snapshots__/buscadores-paridad.test.tsx.snap`
  (64 casos, 128 snapshots; no se regeneraron después de `2e8d5d18`)
- `tests/unit/shared-ui/async-autocomplete-ampliado.test.tsx` (24 casos)
- `tests/guards/guard-buscadores.test.ts` (19 casos)

**Specs:** `specs/QC-35-pantalla-de-pedidos/design.md` (enmienda fechada bajo §9.1).

**Repuntes de import de R4:** ninguno. No se editó ningún test existente.

## Desviaciones respecto a design.md > 4 (las declara el subagente)
- La comprobación de contenido de `PackagingSelect` (`presentationContent == null`) y de
  `PresentationSelect` (`requireContent`) pasa de un `return` en el manejador a `isOptionDisabled`.
- `scrollThreshold` se pasa explícito (48, igual que el defecto) donde existía la constante
  `SCROLL_THRESHOLD`.
- `PackagingSelect` sin permiso no vacía nada a mano: con `queryEnabled={false}` el hook descarta
  lo acumulado.
- La limpieza de comentarios de cabecera y de dentro de los `pedirPagina` conservados va en el mismo
  commit que el código de cada buscador (son pocas líneas), no en un `chore` aparte.

## Mapa R → test
| R | Test |
|---|---|
| R1, R2 | `tests/unit/paridad/buscadores-paridad.test.tsx`: árbol accesible y llamadas a la Server Action por estado, congelados en `2e8d5d18` y en verde sin regenerar tras cada buscador |
| R3 | Capturas: «antes» en `_trabajo/marca/capturas-buscadores-antes/` (54); «después» pendiente del leader (T6) |
| R4 | `guard-buscadores` > caso de diff R4 (41 tests y guardias congelados + snapshots de QC-231); suite completa en CI |
| R5 | `pnpm run typecheck` sin tocar consumidores ni barrels; `guard-buscadores` > caso de diff R21 (barrels) |
| R6, R7, R20 | `tests/guards/guard-buscadores.test.ts` (`primitivo-fuera`, `hook-fuera`, tres excepciones con nombre, muestras que muerden) |
| R8–R17 | `tests/unit/shared-ui/async-autocomplete-ampliado.test.tsx`, un caso o más por R; R16 también `tests/unit/async-autocomplete.test.tsx` sin editar |
| R18 | `guard-identificador-de-request`, `inventario/module-contract`, `recipe-route-contract`, sin editar y en verde |
| R19 | `recipe-route-contract.test.ts` (sin editar) y `guard-buscadores` > R19 (sin `.filter(` en `async-autocomplete.tsx`) |
| R21, R22 | `guard-buscadores` > casos de diff R21 y R22; `guard-dependencias-aprobadas` sin cambios |
| R23 | `specs/QC-35-pantalla-de-pedidos/design.md` §9.1, enmienda del 2026-10-08 (revisión) |

## Verificación (salida real)
**`./init.sh` (rápido), 2026-10-09 00:28 → `== init OK ==`, exit 0:**
```
✓ typecheck paso
✓ lint paso
[test:rapido] tests relacionados con 9 archivo(s) del diff vs origin/dev
 Test Files  1 failed | 98 passed (99)
      Tests  1 failed | 1593 passed | 1 skipped (1595)
[test:rapido] en rojo, pero solo rojos heredados del baseline: tests/unit/navegacion/pantallas-exigen-permiso.test.tsx
[test:rapido] -> vitest run guard module-contract route-contract scope.test ...
 Test Files  2 failed | 98 passed (100)
      Tests  2 failed | 1384 passed | 29 skipped (1415)
[test:rapido] en rojo, pero solo rojos heredados del baseline: tests/unit/recetas/module-contract.test.ts, tests/unit/recetas/scope.test.ts
✓ test:rapido paso
== init OK ==
```
Los tres rojos están en `tests/baseline-rojos.json` (deuda de `dev` desde `897a4f91`, el caso
`/pedidos` y la «segunda pantalla de recetas» en `pedidos/page.tsx`); este diff no toca esos archivos.

**Por subagente:**
- T0: paridad 64/64 en tres corridas seguidas sin escribir snapshots (`.snap` idéntico byte a byte).
- T1: test nuevo + `async-autocomplete.test.tsx` + `order-customer-picker.test.tsx` + paridad: 4
  archivos, 119 tests en verde. El agente probó además los cinco buscadores migrados contra la
  paridad antes de commitear, y una mutación a propósito rompía un snapshot.
- Tanda 2: `CI=1 vitest run buscadores-paridad` 64/64 después de cada buscador; `vitest related`
  por archivo sin más rojo que el de la baseline.
- T3: `guard-buscadores` 19/19; `vitest run guard` 62 archivos, 832 pasan, 12 se saltan (ya se
  saltaban).
- lint: 0 errores; 7 avisos `no-unused-vars` preexistentes en tests ajenos.

**E2E:** no se escribió ni se tocó ningún spec. Los 16 de `e2e/` que usan los testids corren en CI.

## Pendiente
- T6, capturas «después» (leader): `capturas-buscadores.mjs` del scratchpad, con el filtro opcional
  por buscador. No hay captura de la opción no elegible (ver `progress/features/QC-233.md > Tandas`).
