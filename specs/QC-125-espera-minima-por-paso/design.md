# QC-125 — espera-minima-por-paso · design.md

## 1. Resumen

Una prop opcional nueva en el asistente compartido `StepReader`, **desactivada por defecto**, que
la pantalla de ejecución del Operador enciende con 5 s. La vista previa del formulario de recetas no
la pasa y no cambia. La cuenta regresiva es el `CountdownTimer` compartido, que se usa sin tocar su
API.

## 2. Lo que no hay

- **Modelo de datos:** ninguno. Sin tablas, columnas, RLS ni migraciones.
- **Rutas / endpoints / Server Actions:** ninguno nuevo y ninguno modificado. `finishAssignedOrderAction`
  sigue recibiendo el mismo `FormData` (solo `orderId`) (R18).
- **Integraciones externas:** ninguna.
- **Dependencias nuevas:** ninguna. `CountdownTimer` ya está en el repo (commit
  `feat(shared): cronometro regresivo con onEnd` de esta rama) y solo usa React y `cn`.

## 3. Contrato de `StepReader`

```ts
export type StepReaderProps = {
  readonly steps: readonly RecipeStepDocument[];
  readonly onFinish: () => void;
  readonly title?: string;
  /** Segundos que cada paso exige antes de permitir avanzar. Ausente o <= 0: sin espera. */
  readonly minStepSeconds?: number;
};
```

- **Opt-in:** `undefined`, `0`, negativo o no finito ⇒ espera desactivada ⇒ el render y el
  comportamiento son idénticos a hoy (R2). `recipe-form.tsx` no se toca (R3).
- **Genérica, no «5»:** el asistente no conoce la regla de negocio de la planta; recibe un número.
  El `5` vive en quien lo decide, la pantalla de ejecución (§6). Así los tests del componente pueden
  ejercitar la espera con la misma API y los de la pantalla fijan el valor real.
- **Por props (R19):** el asistente sigue sin leer nada por su cuenta. El único import nuevo es
  `@/components/shared/countdown-timer`, que es otro componente compartido: no toca
  `lib/composition`, Server Actions, `next/navigation` ni `app/`, y no arrastra `@tiptap`
  (`tests/guards/guard-editor-aislado.test.ts` sigue verde).
- El barrel `components/shared/step-reader/index.ts` **no cambia**: ya reexporta `StepReaderProps`.

## 4. Estado y reinicio en cada llegada

Dos estados nuevos, en memoria como el resto (R18):

| Estado | Tipo | Significado |
| --- | --- | --- |
| `arrival` | `number` | Contador de llegadas. Empieza en `0` y se incrementa **cada vez que el índice cambia de verdad** (Siguiente, o Anterior fuera del primer paso). |
| `waitedArrival` | `number \| null` | La llegada cuya espera ya se cumplió. `null` al montar. |

Derivado: `waiting = waitEnabled && waitedArrival !== arrival`; `blocked = pending > 0 || waiting`.

- El `CountdownTimer` se monta con `key={arrival}` y `onEnd={() => setWaitedArrival(arrival)}`.
  Cambiar de llegada **desmonta** el cronómetro anterior (su efecto limpia el intervalo, lo afirma
  su propio test) y monta uno nuevo desde la duración completa (R7, R8).
- **La trampa que evita el contador y no evitaría el índice.** Con `key={currentIndex}` y «paso ya
  cumplido = índice», el recorrido *paso 2 cumplido → Anterior → Siguiente antes de que acabe el
  paso 1* volvería a presentar el paso 2 **como cumplido** sin esperar: `waitedIndex === 2` seguiría
  siendo cierto. El contador de llegadas hace imposible heredar tiempo entre llegadas (R8). Hay un
  test con exactamente ese recorrido.
  - *Nota 2026-09-18 (review H1):* el recorrido de arriba **no puede ocurrir**: mientras el paso 1
    espera, Siguiente está bloqueado, así que no se puede avanzar «antes de que acabe el paso 1».
    La trampa real es la contraria: con «cumplido = índice» en un escalar, cumplir el paso 1 →
    Siguiente → **Anterior mientras aún corre la cuenta del paso 2** devuelve al paso 1 como ya
    cumplido (el escalar sigue valiendo 1), sin cuenta y con Siguiente habilitado. Eso incumple R8,
    el contador de llegadas lo evita, y es ese recorrido el que fija el test de R8 que mata el
    mutante del escalar.
- `onEnd` vive en un ref dentro de `CountdownTimer`, que se actualiza en cada render, así que la
  closure siempre ve la `arrival` vigente; y un cronómetro de una llegada anterior ya está
  desmontado, así que no puede marcar como cumplida la actual.
- `goPrevious` sólo incrementa `arrival` si de verdad retrocede (no en el primer paso). `goNext`
  y un `finish` nuevo retornan sin hacer nada si `blocked` (R12, R13): el `disabled` no es la única
  barrera, igual que ya hace `goNext` hoy. Finalizar pasa a llamar a `finish` en vez de a `onFinish`
  directamente.
- Anterior **no** mira `waiting` (R9).
- Arranque (R5): el cronómetro de la llegada `0` se monta en el primer render con pasos. Como
  `StepReader` es cliente y el intervalo nace en un efecto, la cuenta arranca al hidratar; el HTML
  del servidor ya muestra `00:05`. No hay botón «Comenzar».
- Estado vacío (sin pasos): no hay cronómetro ni espera (QC-64 R21 intacta).

## 5. Render del bloqueo con dos causas

El párrafo de elementos se queda **como está** (mismo `id`, mismo `data-testid`
`step-reader-blocked-reason`, mismo texto), para no romper QC-64, QC-63 ni `e2e/recetas-pasos.spec.ts`.
Se añade un segundo párrafo:

```tsx
{waiting && (
  <p id={waitReasonId} data-testid="step-reader-wait-reason" className="text-base">
    Espera <CountdownTimer key={arrival} seconds={minStepSeconds} onEnd={...} /> para continuar.
  </p>
)}
```

- **Texto visible junto al botón** (R14), en el mismo sitio que el motivo de elementos, antes de la
  fila de botones. El copy va en la constante `TEXTS` (partido en prefijo y sufijo) — pendiente de
  la pregunta abierta 2.
- `aria-describedby` del botón de avanzar = lista de los ids de los motivos **presentes**, separada
  por espacio: sólo elementos ⇒ `reasonId` (idéntico a hoy, el test de QC-64 que compara igualdad
  exacta sigue verde); sólo tiempo ⇒ `waitReasonId`; ambos ⇒ `"reasonId waitReasonId"` (R15); ninguno
  ⇒ sin atributo (R16).
- El cronómetro va **dentro** del motivo: la cuenta visible (R6) y el motivo son la misma frase, y
  la descripción accesible del botón incluye el tiempo restante vía el `aria-label` del `role="timer"`.
- `role="timer"` tiene `aria-live="off"` implícito: la cuenta **no** se anuncia cada segundo. El
  cambio de paso se sigue anunciando por la región `aria-live="polite"` existente (QC-64 R27).
- Al cumplirse la espera el párrafo desaparece con el cronómetro dentro (R16). Eso es seguro porque
  el desmontaje ocurre **después** de que `onEnd` haya disparado: es `onEnd` quien lo provoca.

## 6. Pantalla de ejecución

`app/(private)/asignacion/[id]/components/order-execution-screen.tsx`:

```tsx
const MIN_STEP_SECONDS = 5;
...
<StepReader steps={...} title={...} onFinish={...} minStepSeconds={MIN_STEP_SECONDS} />
```

Constante de módulo, no exportada: no cambia entre entornos (no es configuración en el sentido de
`CHECKPOINTS.md > Configuracion`) y la ficha la fija en 5 s sin configuración (R4). Los tests
escriben `5` / `5000 ms` literal en vez de importarla, para que un cambio accidental del valor los
ponga rojos.

## 7. Alternativas descartadas

1. **Envolver `StepReader` desde la pantalla, sin tocar el componente.** Descartada: los botones
   Siguiente/Finalizar, su `disabled`, su guarda en el handler y el párrafo de motivo son **internos**
   del asistente; desde fuera no hay forma de deshabilitarlos ni de añadir un motivo asociado por
   `aria-describedby`. Taparlos con un overlay rompería R14/R20 (el motivo dejaría de estar asociado
   al botón y el teclado seguiría llegando). Por eso esta ficha **tiene** que modificar
   `step-reader.tsx`, y de ahí la pregunta abierta 1.
2. **Prop booleana `requireStepWait` con el `5` dentro de `StepReader`.** Descartada: mete la regla
   de negocio de la planta en un componente compartido que también usa el Administrador, y obliga a
   los tests del componente a depender de ese número.
3. **Prop de «desbloqueo» controlada por el padre** (`canAdvance` + la pantalla gestiona su propio
   cronómetro y escucha cambios de paso). Descartada: exigiría exponer el índice del paso actual
   hacia fuera (un callback `onStepChange`) y duplicar en la pantalla el conocimiento de «llegada»;
   dos sitios decidiendo cuándo empieza un paso.
4. **Cambiar la API de `CountdownTimer` con un `resetKey` o `startedAt`.** Descartada: no hace
   falta. Remontar con `key` ya reinicia la cuenta desde la duración completa y su test de desmontaje
   garantiza que el intervalo viejo no dispara `onEnd`. Tocarlo ampliaría el diff a un componente
   compartido sin necesidad.
5. **`setTimeout(5000)` propio en el asistente, con `CountdownTimer` sólo para pintar.** Descartada:
   dos relojes que pueden discrepar (el botón se libera y el cronómetro aún marca `00:01`, o al
   revés) y contradice la decisión 5. La fuente de verdad del fin de la espera es el `onEnd` del
   cronómetro (R10).

## 8. `CountdownTimer`: sin cambios

Se usa como está: `seconds={minStepSeconds}`, `onEnd`, sin `className`. Lo que conviene saber:

- Llama a `onEnd` una sola vez al llegar a `00:00`, medido contra `Date.now()`, así que una pestaña
  en segundo plano no alarga la espera más allá del siguiente tick.
- Con 5 s pinta `text-destructive` todo el tiempo (umbral de 10 s): pregunta abierta 3. Si el humano
  pide otro tono, el cambio sería un umbral opcional en su API, y entonces sí se tocarían
  `countdown-timer.tsx` y su test.

## 9. Tests

### Técnica

Los casos con la espera activa usan el reloj falso de Vitest, como `countdown-timer.test.tsx` y
`user-table.test.tsx`: `vi.useFakeTimers()`, `act(() => vi.advanceTimersByTime(ms))` y
`fireEvent.click` para las interacciones mientras el reloj está falso. Ningún test espera tiempo
real. Los casos sin espera siguen con `setupUser()` y reloj real, sin cambios.

**Frontera del reloj exacto (R4):** el cronómetro hace ticks de 1000 ms contra un instante de fin,
así que a los 4999 ms quedan 4 ticks y sigue impedido; a los 5000 ms el quinto tick da `00:00` y
dispara `onEnd`. Los dos lados se afirman.

### Los nuevos casos van en archivos que YA existen

`tests/unit/recetas-ui/recipe-route-contract.test.ts` tiene una lista **cerrada**
`TESTS_QUE_LO_NOMBRAN` de los tests que pueden nombrar `StepReader`/`step-reader`. Un archivo de test
nuevo que lo nombrase la pondría roja. Por eso todo va a los tres archivos ya listados o permitidos:

| Archivo | Qué cambia |
| --- | --- |
| `tests/unit/recetas-ui/step-reader.test.tsx` | Casos nuevos a nivel de componente con `minStepSeconds`: R1, R2, R6–R12, R14–R17, R19 (fuente: importa `countdown-timer`, sin `setTimeout`/`setInterval`/`Date.now` propios), R20. Los casos existentes **no se tocan** y demuestran R2 por sí mismos. |
| `tests/unit/asignaciones-ui/order-execution-screen.test.tsx` | Casos nuevos: R4 (4999 ms / 5000 ms), R5 (sin control «Comenzar», cuenta visible al montar), R13 (Finalizar antes de 5 s no llama a la acción), R18 (el `FormData` enviado sólo lleva `orderId`; remontar reinicia en paso 1). **Se enmiendan dos existentes:** «si la operacion falla, muestra el error» (hoy pulsa Finalizar sin esperar: pasa a reloj falso y avanza 5 s antes de pulsar) y «R18 — el asistente heredado no aparece en el diff» (según la pregunta abierta 1, con nota fechada). «R19: bloqueo sin escape», R20, R21, R26 y R1 siguen sin cambios. |
| `tests/unit/recetas-ui/recipe-form.test.tsx` | En el caso existente de la vista previa, afirmar que dentro del modal no hay `countdown-timer` ni `step-reader-wait-reason` (R3). El caso que pulsa Finalizar sin esperar ya lo demuestra en positivo. |

`tests/unit/shared/countdown-timer.test.tsx` **no se toca**.

### E2E

`CHECKPOINTS.md` exige E2E para flujos críticos (autenticación, permisos, movimientos de inventario,
importes, webhooks). Esta ficha no toca ninguno: es una restricción de cliente sobre una pantalla
que ya tiene E2E. **No se añade E2E nuevo.** El existente `e2e/ejecucion-receta.spec.ts` (R29 de
QC-63) debe seguir verde (R22): su `click()` sobre Siguiente y Finalizar espera por defecto a que el
botón esté habilitado (sin `actionTimeout` en `playwright.config.ts`, con `test.setTimeout(180_000)`),
así que absorbe los 2×5 s sin cambios. Si en la práctica fallara, la enmienda permitida es esperar
explícitamente a `toBeEnabled` con un plazo mayor que 5 s, nunca quitar pasos del recorrido.
`e2e/recetas-pasos.spec.ts` recorre la vista previa, que no tiene espera: no cambia.

## 10. Multiplataforma

Sin excepción declarada. No se añade ningún control interactivo (R20); el cronómetro es un `span`
dentro de un párrafo `text-base`. Nada depende de `:hover`, no hay `100vh`, y el test R26 de la
pantalla, que recorre todos los `button` y exige 44×44, sigue aplicando.

## 11. Comentarios

`step-reader.tsx` tiene una cabecera que cita requisitos (`R14-R21`, `design.md > 5`). Por
`docs/conventions.md > Comentarios`, se limpian **sólo las líneas que toca la rama** y lo nuevo no
cita fichas ni requisitos. Si la limpieza abulta, va en su propio commit `chore(QC-125)`.

## 12. Riesgos

- **Pregunta abierta 1 sin responder:** el gate quedará rojo por el test de diff de QC-63. No se
  implementa la enmienda sin la ratificación del humano.
- **Deriva por pestaña en segundo plano:** los navegadores móviles pueden congelar el intervalo; al
  volver, el siguiente tick recalcula contra el instante de fin y libera el botón. La espera nunca es
  **más corta** que 5 s; puede ser algo más larga. Aceptable: la ficha pide un mínimo.
- **Recarga:** reinicia la cuenta en el paso 1 y vacía el marcado, igual que hoy (QC-63 R16). Sin
  validación en servidor (fuera de alcance), un usuario técnico podría saltarse la espera desde las
  herramientas del navegador; es exactamente lo que la ficha deja fuera.
