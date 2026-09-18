# QC-125 — espera-minima-por-paso · bitacora de implementacion

Rama `feature/QC-125-espera-minima-por-paso`, worktree `.worktrees/QC-125-espera-minima-por-paso`.
Fecha: 2026-09-18. Sin merge con `dev`, sin push, sin PR (lo decide el leader tras el reviewer).

## Estado de las tasks

| Task | Estado | Commit |
| --- | --- | --- |
| T1 respuesta a la pregunta abierta 1 | [x] opcion (b) lista cerrada, anotada en `tasks.md` | `a19a3c87` |
| T2 `StepReader` con espera opt-in | [x] | `0d4754a7` |
| T4 la pantalla de ejecucion activa 5 s | [x] | `74d63eb9` |
| T3 tests del componente | [x] | `dcc16101` |
| T5 tests de la pantalla + enmiendas | [x] | `530a48e6` |
| T6 la vista previa no espera | [x] | `bc64e0fd` |
| T7 E2E existente sigue verde | **[ ] BLOQUEADA**: no se pudo ejecutar (ver Bloqueos) | — |
| T8 trazabilidad y gate de cierre | [ ] este archivo; el `./init.sh` completo lo corre el leader | — |

## Archivos tocados

Produccion:
- `components/shared/step-reader/step-reader.tsx` — prop `minStepSeconds?`, estados `arrival` / `waitedArrival`, `blocked = pending > 0 || waiting`, `finish()` guardado, `goPrevious`/`goNext` solo cuentan llegada si el indice cambia, parrafo `step-reader-wait-reason` con `CountdownTimer key={arrival}` dentro, `aria-describedby` con la lista de motivos presentes, copy en `TEXTS`. El parrafo `step-reader-blocked-reason` conserva id, testid y texto; su condicion pasa de `blocked` a `pending > 0`. Comentarios: solo se limpio la cita a un requisito en la linea tocada de `goPrevious`.
- `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` — `const MIN_STEP_SECONDS = 5` de modulo y la prop en el `StepReader`.

Tests:
- `tests/unit/recetas-ui/step-reader.test.tsx` — 20 casos nuevos; los 23 existentes sin editar (solo se ampliaron los imports con `act` y `fireEvent`).
- `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` — casos nuevos R4, R5, R13, R18; enmiendas con nota fechada 2026-09-18: «si la operacion falla, muestra el error» (reloj falso, avanza 5000 ms antes de Finalizar, sin aflojar la afirmacion) y el test R18 heredado de QC-63, tensado a lista cerrada cuyo unico permitido es `components/shared/step-reader/step-reader.tsx` (conserva el skip cuando no hay merge-base).
- `tests/unit/recetas-ui/recipe-form.test.tsx` — el caso existente de la vista previa pasa a llamarse «R3, R11: ...» y afirma que el modal no contiene `countdown-timer` ni `step-reader-wait-reason`.

Spec: `specs/QC-125-espera-minima-por-paso/tasks.md` (marcas y nota de T1).

No se tocaron: `countdown-timer.tsx` y su test, `step-reader/index.ts`, `step-document-view.tsx`, `recipe-form.tsx`, `recipe-route-contract.test.ts`, `e2e/`, `lib/`, `db/`, `docs/dependencias.md`.

## Mapa R<n> -> test

SR = `tests/unit/recetas-ui/step-reader.test.tsx`; OES = `tests/unit/asignaciones-ui/order-execution-screen.test.tsx`; RF = `tests/unit/recetas-ui/recipe-form.test.tsx`.

| R | Test |
| --- | --- |
| R1 | SR «StepReader — R1 › Siguiente permanece deshabilitado hasta que transcurre la duracion desde la llegada, y luego se habilita» |
| R2 | SR «StepReader — R2» (4 casos: sin prop, 0, negativo, NaN) + los 23 casos existentes de SR sin editar |
| R3 | RF «R3, R11: abrir la vista previa no invoca ninguna operacion, monta el asistente SIN espera y sobre los pasos escritos EN ESE INSTANTE» |
| R4 | OES «pantalla de ejecucion — R4 › a los 4999 ms el avance sigue impedido y a los 5000 ms deja de estarlo» |
| R5 | OES «pantalla de ejecucion — R5 › muestra la cuenta completa al montar sin ninguna accion del usuario y no ofrece ningun control Comenzar» |
| R6 | SR «R6: muestra una cuenta regresiva visible mientras la espera no se ha cumplido» |
| R7 | SR «R7: al avanzar con Siguiente, la cuenta se reinicia a la duracion completa en el paso nuevo» |
| R8 | SR «R8: ninguna llegada hereda el tiempo cumplido en una llegada anterior, ni al mismo paso ni a otro» y «R8: la activacion programatica sobre el boton deshabilitado tampoco hereda el tiempo cumplido» |
| R9 | SR «R9: Anterior sigue disponible mientras la cuenta corre, en un paso que no es el primero» |
| R10 | SR «R10: la fuente del asistente importa el CountdownTimer compartido y no implementa ningun temporizador propio» |
| R11 | SR «R11: con la espera activa, los unicos botones son Anterior y Siguiente ademas de los elementos» |
| R12 | SR «R12: marcar todos los elementos no acorta la espera, y la activacion programatica no avanza mientras espera» y «R12: cumplir la espera no exime de marcar los elementos pendientes» |
| R13 | OES «pantalla de ejecucion — R13 › pulsar Finalizar antes de los 5 s no invoca finishAssignedOrderAction»; SR «R13 (a nivel de componente): en el ultimo paso, Finalizar tambien espera» |
| R14 | SR «R14: el motivo de tiempo es texto visible y el boton lo referencia con aria-describedby» |
| R15 | SR «R15: con elementos pendientes y espera pendiente a la vez, aparecen los dos motivos y el boton queda asociado a ambos» |
| R16 | SR «R16: al cumplirse la espera desaparecen el motivo y la cuenta, y sin elementos pendientes el boton se habilita sin aria-describedby» |
| R17 | SR «R17: cumplir la espera no marca ni desmarca elementos, y el marcado sobrevive a ir y volver aunque la espera se reinicie» |
| R18 | OES «pantalla de ejecucion — R18 › el FormData enviado tras cumplir la espera y finalizar solo lleva orderId; remontar reinicia la cuenta en el paso 1» |
| R19 | SR «R19: el unico import nuevo del asistente es el CountdownTimer compartido, y sigue sin lo que R19/R20 prohiben» + tests de fuente existentes de SR; `tests/guards/guard-editor-aislado.test.ts` verde |
| R20 | SR «R20: tras cumplirse la espera, se puede avanzar solo con teclado»; OES R26 existente (44x44) sin editar |
| R21 | OES «R18 — el asistente heredado solo puede cambiar step-reader.tsx (lista cerrada) › todo archivo cambiado de components/shared/step-reader/** esta en la lista permitida» (enmienda fechada); casos existentes R19, R20, R21, R26 y R1 de OES y los 23 de SR, verdes sin edicion |
| R22 | `e2e/ejecucion-receta.spec.ts` «R29 - el Operador entra, ... recorre los pasos hasta Finalizar y el pedido queda ENTREGADO en base» — **NO EJECUTADO** (ver Bloqueos) |

## Mutaciones (hechas por los subagentes y revertidas; el diff de produccion quedo intacto)

- Quitar `|| waiting` de `blocked`: rojos R1, R7, R8 (los dos), R12 (el de «no acorta»), R13. Cumple lo pedido para R1/R12.
- Cambiar `key={arrival}` por `key={currentIndex}` **solo en el JSX**: 0 rojos. Tambien 0 rojos con «cumplido = indice» guardado en un escalar. Solo se ponen rojos los dos casos de R8 con memoria persistente por indice (un Set de indices cumplidos). **Desviacion respecto al «Hecho cuando» de T3**: esa mutacion literal no es detectable, porque `onEnd` sigue marcando por `arrival`; el test de R8 protege la trampa real que describe `design.md > 4`. Lo decide el reviewer.
- `MIN_STEP_SECONDS = 4`: rojo R4 (y R5 y R18, que afirman 00:05).
- `minStepSeconds={5}` en `recipe-form.tsx`: rojo R3.

Nota: React no invoca `onClick` en un `button` deshabilitado, ni con `fireEvent.click` ni quitando el atributo a mano, asi que ningun test ejercita por si solo la guarda interna de `goNext`/`finish` (retorno temprano si `blocked`); los casos de activacion programatica (R8, R12) afirman el resultado observable.

## Salida real de la verificacion (ejecutada por el implementer)

    $ pnpm run typecheck
    > tsc --noEmit
    (sin errores, exit 0)

    $ pnpm run lint
    > eslint
    (sin problemas)

    $ pnpm exec vitest run tests/unit/recetas-ui/step-reader.test.tsx tests/unit/asignaciones-ui/order-execution-screen.test.tsx tests/unit/recetas-ui/recipe-form.test.tsx tests/unit/recetas-ui/recipe-route-contract.test.ts tests/unit/shared/countdown-timer.test.tsx tests/guards/guard-editor-aislado.test.ts
     Test Files  6 passed (6)
          Tests  135 passed (135)
    (repetido 3 veces seguidas: 3 de 3 verdes)

    $ pnpm run e2e e2e/ejecucion-receta.spec.ts e2e/recetas-pasos.spec.ts
      8 failed
    Error: browserType.launch: Executable doesn't exist at C:\Users\angie\AppData\Local\ms-playwright\chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe
    (lo mismo en webkit-2336; la carpeta ms-playwright no existe)

`vitest related` sobre los dos archivos de produccion (subagente de T2/T4, antes de T5): `tests/unit/recetas-ui/recipe-page.test.tsx` con 46 rojos por `TypeError: Cannot read properties of undefined (reading 'clear')` en `window.localStorage.clear()` — ajeno a la rama (Node 26), no se toco. El error de `companyId` en `supplier-crud.int.test.ts` no aparecio (el cliente de Prisma se regenero al montar el entorno).

No se corrio la suite completa ni `./init.sh`: lo corre el leader.

## Bloqueos

1. **T7 / R22 sin verificar.** Los navegadores de Playwright no estan instalados en esta maquina (`pnpm exec playwright install` los descargaria). No se instalaron: es una descarga al entorno fuera del encargo. Ningun test E2E llego a arrancar, asi que no hay evidencia ni a favor ni en contra. `e2e/ejecucion-receta.spec.ts` no se modifico.
2. Entorno del worktree: hubo que correr `pnpm install --frozen-lockfile`, `pnpm exec prisma generate` y `pnpm exec next typegen` para que `typecheck` funcionara (sin cambios de codigo).

## Nota tecnica para futuros tests con reloj falso en esta cascada

OES usa `await act(async () => { await vi.advanceTimersByTimeAsync(ms) })`: con la variante sincrona el subagente vio flakes (1 de cada 4-5 corridas) en la cascada CountdownTimer, StepReader, OrderExecutionScreen. SR usa la variante sincrona y fue estable en las 3 corridas. `userEvent` bajo reloj falso cuelga en este repo; R20 vuelve a reloj real antes de usar `setupUser()`.
