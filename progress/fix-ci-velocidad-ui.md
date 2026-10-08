# Velocidad del proyecto `ui` de Vitest (jsdom, 208 archivos) — 2026-10-07

**Decisión: no se cambia nada.** `vitest.config.mts` y `tests/setup.ts` quedan como en `origin/dev`.
La única palanca que acelera de verdad (`isolate: false`) mete flakes que dependen del orden, y
la regla del encargo era no aceptar ningún rojo nuevo.

## Contexto
- CI (run 37568468781, 2 vCPU): el `ui` tarda 14,5 min de pared y solo 4,2 min son de tests. El
  resto se va en `import` y en montar jsdom en cada archivo.
- Medido en local (12 núcleos, Node 24.13, Vitest 4.1.10) con
  `vitest run --project ui --reporter=dot`. Había otro agente trabajando a la vez: el baseline
  osciló entre 370 y 481 s. Por eso se comparan **proporciones** frente al rango del baseline.
- Antes de medir hubo que generar el cliente de Prisma en el worktree (`prisma generate`). Sin él
  caen 80 suites con `Cannot find module '.prisma/client/default'`. Ese fallo es del entorno, no
  de la config.

## Resultados
| Variante | Pared | Archivos rojos | ¿Rojos nuevos frente al baseline? |
| --- | --- | --- | --- |
| baseline (base2) | 481 s | 5 | — (los 5 conocidos del baseline) |
| baseline (base3) | 370 s | 5 | — |
| `isolate: false` solo | 165 s | 95 (611 tests) | sí: el DOM y los `vi.mock` pasan de un archivo a otro |
| `isolate: false` + setup (`cleanup`, `vi.resetModules`, restaurar timers/mocks/storage/DOM) corrida 1 | 139 s | 7 | sí: `order-execution-screen`, `formula-import-page` |
| ídem, corrida 2 | 134 s | 7 | sí: `formula-import-page`, `supplier-sheet` (otro conjunto) |
| ídem, `--sequence.shuffle` semilla 11 | 89 s | 8 | sí: `order-list-section`, `catalog-import-review`, `formula-import-page` |
| ídem, `--sequence.shuffle` semilla 22 | 90 s | 9 | sí: `packing-order-screen`, `order-sheet`, `catalog-line-form`, `formula-import-page` |
| `pool: 'threads'` (aislado) | 487 s | 5 | no, pero tampoco gana tiempo |
| `deps.optimizer.client.enabled` | 382 / 372 s | 5 / 5 | no; la mejora queda dentro del ruido (base3 = 370 s) y solo optimiza `react-dom` |

`css` no hace falta tocarlo: Vitest ya no procesa CSS por defecto.

## Por qué se descarta `isolate: false`
Con el setup de limpieza va **entre 3 y 5 veces más rápido**, pero los rojos nuevos cambian de una
corrida a otra. Eso es justo lo que el gate no puede tolerar
(`docs/verification.md > Los flakes de saturacion`). La causa es estado de módulo dentro de
`node_modules`: esos módulos no se recargan entre archivos y `vi.resetModules` no los reinicia.
- `formula-import-page` (R2): el contador de `useId` de `react-dom` sigue creciendo de un archivo
  a otro y llega a ids como `_r_26r_`. El test normaliza con `/_r_\d+_/`, que solo admite dígitos.
  Es un rojo determinista con worker compartido; el arreglo sería `/_r_[0-9a-z]+_/`.
- El resto son `findBy*` que no encuentran el error pintado tras una acción mockeada que falla
  (`*-finish-error`, `supplier-error-name`, `order-form-error`…), o mocks llamados 0 veces. No se
  reproducen en aislamiento ni con `--maxWorkers=1` sobre `tests/unit/shared` y 3 semillas. Son
  fugas que dependen del orden; no se diagnosticaron una por una.

## Riesgos y siguiente paso (si se quiere el x3–x5)
- Haría falta una tarea propia:
  1. setup con `afterEach(cleanup)` explícito (sin aislamiento, el auto-cleanup de RTL se
     registra solo en el primer archivo), `vi.resetModules()` y restaurar timers, mocks, globals,
     storage y DOM en `afterAll`;
  2. arreglar cada archivo con fuga (al menos los 8 de arriba);
  3. ≥ 5 corridas con `--sequence.shuffle` y semillas distintas sin rojos nuevos.
- Riesgo de fondo: en CI hay 2 vCPU, así que hay menos workers y cada uno vive más. Acumula más
  estado que en local y aparecerían fugas que aquí no se ven. Un `isolate: false` por archivo o
  carpeta no existe en Vitest 4: sería un cuarto proyecto con su propio `include`.
- Sin dependencias nuevas (regla 7). No se tocó `init.sh`, `scripts/` ni `.github/`.
- El diff de este worktree en `progress/deudas.md`, `tests/baseline-rojos.json` y
  `credential-setup.int.test.ts` no es mío: es del trabajo D34 que corre en paralelo.
