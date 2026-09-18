# QC-125 — espera-minima-por-paso · tasks.md

> Orden: T1 → T2 → (T3 [P] · T4) → T5 → (T6 [P] · T7 [P]) → T8.
> `[P]` = puede ir en paralelo con las otras `[P]` de su tanda (archivos disjuntos).
> Gate por tanda: `./init.sh --rapido`. Cierre de feature: `./init.sh` completo.

- [x] **T1 — Respuesta del humano a la pregunta abierta 1** (enmienda del test de QC-63 R18).
  - **Respuesta (2026-09-18):** opcion (b), la del diseno. El humano aprobo el spec («aprobado») sin
    elegir alternativa, asi que vale tal como esta escrito: el test R18 de QC-63 se tensa a lista
    cerrada en la que solo puede cambiar `components/shared/step-reader/step-reader.tsx`. Sin cambio en
    `design.md`. Tambien quedan como estan el color de `CountdownTimer` y el copy del motivo de tiempo.
  - Depende de: aprobación del spec.
  - Archivos: ninguno (la respuesta se anota en `progress/current.md` y, si cambia el diseño, en
    `design.md > 9`).
  - Hecho cuando: está escrita la opción elegida —(a) retirar, (b) lista cerrada u otra— con fecha.
    Sin esto no arranca T5.

- [x] **T2 — `StepReader` con espera opt-in.**
  - Depende de: aprobación del spec.
  - Archivo: `components/shared/step-reader/step-reader.tsx`.
  - Qué: prop `minStepSeconds?`; estados `arrival` y `waitedArrival`; `blocked` con las dos causas;
    `finish` guardado; `goPrevious` sólo cuenta llegada si retrocede de verdad; párrafo
    `step-reader-wait-reason` con `CountdownTimer key={arrival}` dentro; `aria-describedby` con la
    lista de motivos presentes; copy en `TEXTS` (`design.md > 3, 4, 5`). Limpieza de comentarios
    sólo en las líneas tocadas, sin citar fichas ni requisitos.
  - Hecho cuando: `pnpm run typecheck` y `pnpm run lint` verdes, y `tests/unit/recetas-ui/step-reader.test.tsx`
    **sin tocar** sigue verde (prueba de R2).

- [ ] **T3 [P] — Tests del componente.**
  - Depende de: T2.
  - Archivo: `tests/unit/recetas-ui/step-reader.test.tsx` (sólo casos nuevos; los existentes no se
    editan).
  - Casos, con `R<n>` en el nombre: R1, R2 (sin prop ⇒ ni `countdown-timer` ni `step-reader-wait-reason`),
    R6, R7, R8 (incluido el recorrido *paso 2 cumplido → Anterior → Siguiente antes de que acabe el
    paso 1 ⇒ el paso 2 vuelve a esperar*), R9, R10 (fuente: importa `countdown-timer`; sin
    `setTimeout`/`setInterval`/`Date.now`), R11 (sólo dos `button` en el asistente), R12 (marcar todo
    no acorta; esperar no exime; activación programática no avanza), R14, R15 (`aria-describedby` con
    los dos ids), R16, R17, R19 (tests de fuente existentes siguen verdes), R20 (tras la espera,
    avanzar con teclado).
  - Hecho cuando: todos verdes con reloj falso y **por mutación**: quitar `|| waiting` de `blocked`
    pone rojos R1/R12; cambiar `key={arrival}` por `key={currentIndex}` pone rojo el caso de R8.

- [x] **T4 — La pantalla de ejecución activa la espera.**
  - Depende de: T2.
  - Archivo: `app/(private)/asignacion/[id]/components/order-execution-screen.tsx`.
  - Qué: `const MIN_STEP_SECONDS = 5` de módulo y `minStepSeconds={MIN_STEP_SECONDS}` en el
    `StepReader` (`design.md > 6`). Nada más.
  - Hecho cuando: typecheck y lint verdes.

- [ ] **T5 — Tests de la pantalla de ejecución.**
  - Depende de: T1, T4.
  - Archivo: `tests/unit/asignaciones-ui/order-execution-screen.test.tsx`.
  - Casos nuevos: R4 (impedido a 4999 ms, liberado a 5000 ms), R5 (cuenta visible al montar, ningún
    control «Comenzar»), R13 (Finalizar antes de 5 s no llama a `finishAssignedOrderAction`), R18 (el
    `FormData` sólo lleva `orderId`; remontar reinicia la cuenta en el paso 1).
  - Enmiendas, con nota fechada: «si la operacion falla, muestra el error» pasa a reloj falso y
    avanza 5 s antes de pulsar Finalizar; «R18 — el asistente heredado no aparece en el diff» según T1
    (R21).
  - Hecho cuando: el archivo entero verde; los casos R19, R20, R21, R26 y R1 existentes siguen verdes
    sin edición; y por mutación, poner `MIN_STEP_SECONDS = 4` pone rojo R4.

- [ ] **T6 [P] — La vista previa no espera.**
  - Depende de: T2.
  - Archivo: `tests/unit/recetas-ui/recipe-form.test.tsx`.
  - Qué: en el caso existente que abre la vista previa, afirmar que el modal no contiene
    `countdown-timer` ni `step-reader-wait-reason` (R3).
  - Hecho cuando: verde, y por mutación, pasar `minStepSeconds={5}` en `recipe-form.tsx` (sin
    commitearlo) lo pone rojo.

- [ ] **T7 [P] — E2E existente sigue verde.**
  - Depende de: T4.
  - Archivo: `e2e/ejecucion-receta.spec.ts` — **sólo si** falla con la espera; la única enmienda
    permitida es esperar `toBeEnabled` con plazo mayor que 5 s antes de cada `click` (`design.md > 9`).
  - Hecho cuando: `pnpm run e2e` verde en el caso R29 de QC-63 (R22) y en `e2e/recetas-pasos.spec.ts`.

- [ ] **T8 — Trazabilidad y gate de cierre.**
  - Depende de: T3, T5, T6, T7.
  - Archivo: `progress/impl_QC-125-espera-minima-por-paso.md` con el mapa `R1…R22 -> test`.
  - Hecho cuando: cada `R<n>` tiene al menos un test nombrado, y `./init.sh` completo termina en
    verde.

## Archivos que tocan las tasks

| Archivo | Tasks |
| --- | --- |
| `components/shared/step-reader/step-reader.tsx` | T2 |
| `app/(private)/asignacion/[id]/components/order-execution-screen.tsx` | T4 |
| `tests/unit/recetas-ui/step-reader.test.tsx` | T3 |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | T5 |
| `tests/unit/recetas-ui/recipe-form.test.tsx` | T6 |
| `e2e/ejecucion-receta.spec.ts` | T7 (condicional) |
| `progress/impl_QC-125-espera-minima-por-paso.md` | T8 |

**No se tocan:** `components/shared/countdown-timer.tsx` y su test,
`components/shared/step-reader/index.ts`, `components/shared/step-reader/step-document-view.tsx`,
`app/(private)/produccion/formulas/components/recipe-form.tsx`,
`tests/unit/recetas-ui/recipe-route-contract.test.ts` (su lista cerrada de tests ya incluye los tres
archivos de arriba), y nada de `lib/`, `db/` ni `docs/dependencias.md`.
