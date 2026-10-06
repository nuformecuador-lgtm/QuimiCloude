'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { CountdownTimer } from '@/components/shared/countdown-timer';
import { Button } from '@/components/ui/button';
import type { RecipeStepDocument } from '@/lib/modules/recetas';
import { cn } from '@/lib/utils';

import { StepDocumentView } from './step-document-view';

/**
 * Asistente de lectura de una receta: **un paso por pantalla** (R14-R21, `design.md > 5`).
 *
 * **Recibe TODO por props (R20).** No lee datos por su cuenta, no importa `lib/composition`, ni
 * Server Actions, ni `next/navigation`, ni nada de `app/`: por eso vive en `components/shared/` y
 * por eso QC-63 podra montarlo en la ruta del Operador pasandole otro `onFinish` sin tocar una
 * linea de aqui. Un test de fuente afirma que ninguno de estos archivos menciona lo prohibido.
 *
 * **Estado en memoria y solo en memoria (R19):** el indice del paso actual y un conjunto de
 * items marcados con clave `${paso}:${bloque}:${item}`. Sin `localStorage`, sin `sessionStorage`
 * y sin URL — desmontarlo se lleva el marcado con el.
 *
 * **El bloqueo (R17)** no es solo `disabled`: el motivo va en un parrafo de **texto visible**
 * junto al boton y asociado por `aria-describedby`. Un `title` no vale, porque en tactil no hay
 * `:hover` (R26) y una pantalla que no responde sin decir por que es una pantalla rota.
 *
 * Los textos viven en UNA constante para que la i18n futura sea sustituirla.
 *
 * **Enmienda del 2026-09-21, fuera de SDD, por decision humana explicita.** La prop `mode` se
 * anadio sin pasar por requirements/design/tasks. `mode="lectura"` (el valor por defecto)
 * preserva integro el contrato que describen los specs de QC-63, QC-64 y QC-125 — de ahi que la
 * API se llamara antes "cerrada". La variante `mode="ejecucion"` es un rediseno para la pantalla
 * del operario en planta (tablet, guantes, un dedo que ya va en camino al boton) y NO esta
 * cubierta por los requisitos de esas fichas: quien la toque no encontrara un `R<n>` que la
 * ampare. Quien busque trazabilidad completa, que la pida — hoy no existe.
 */

/** Objetivo tactil minimo (R26). Misma clase que ya usa el resto del repo. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

/** Objetivo tactil de la accion primaria en `'ejecucion'`: 64px minimo, texto mayor. */
const PRIMARY_TOUCH_TARGET_EJECUCION = 'min-h-16 min-w-11 text-lg font-semibold';

const TEXTS = {
  empty: 'Esta receta no tiene ningun paso que leer.',
  previous: 'Anterior',
  next: 'Siguiente',
  finish: 'Finalizar',
  position: (current: number, total: number) => `Paso ${current} de ${total}`,
  blocked: (pending: number) => `Marca los ${pending} elementos pendientes para continuar.`,
  waitPrefix: 'Espera',
  waitSuffix: 'para continuar.',
} as const;

export type StepReaderProps = {
  readonly steps: readonly RecipeStepDocument[];
  readonly onFinish: () => void;
  readonly title?: string;
  /** Segundos que cada paso exige antes de permitir avanzar. Ausente, cero, negativo o no
   *  finito: sin espera. */
  readonly minStepSeconds?: number;
  /** `'lectura'` (por defecto) es el contrato historico. `'ejecucion'` es la variante de planta:
   *  ver la enmienda del docblock de este archivo. */
  readonly mode?: 'lectura' | 'ejecucion';
  readonly finishLabel?: string;
  /** Mientras la accion de terminar esta en curso: evita enviarla dos veces. */
  readonly finishBusy?: boolean;
};

/** Clave de un item marcado. El paso entra en la clave: marcar en el paso 2 no marca en el 1. */
function itemKey(stepIndex: number, blockIndex: number, itemIndex: number): string {
  return `${stepIndex}:${blockIndex}:${itemIndex}`;
}

/**
 * Items sin marcar del paso ACTUAL (R17). Un paso sin lista de verificacion devuelve 0, que es
 * exactamente lo que pide R18: se avanza sin ninguna accion previa.
 */
function countPendingItems(
  document: RecipeStepDocument,
  stepIndex: number,
  checked: ReadonlySet<string>,
): number {
  return document.blocks.reduce((pending, block, blockIndex) => {
    if (block.kind === 'paragraph') {
      return pending;
    }
    const sinMarcar = block.items.filter(
      (_item, itemIndex) => !checked.has(itemKey(stepIndex, blockIndex, itemIndex)),
    );
    return pending + sinMarcar.length;
  }, 0);
}

/** Radio del anillo de espera. Fijo: el anillo no tiene tamanos variables en este diseno. */
const WAIT_RING_RADIUS = 20;
const WAIT_RING_CIRCUMFERENCE = 2 * Math.PI * WAIT_RING_RADIUS;

/**
 * Anillo SVG que se vacia a lo largo de `seconds`. El numero sigue saliendo de
 * `CountdownTimer`: esto solo dibuja la espera, con una transicion CSS que arranca un frame
 * despues de montar para que el navegador tenga el estado inicial pintado antes de animar.
 */
function WaitRing({ seconds }: { readonly seconds: number }) {
  const [depleted, setDepleted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setDepleted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 48 48"
      aria-hidden="true"
      data-testid="step-reader-wait-ring"
      className="shrink-0"
    >
      <circle cx="24" cy="24" r={WAIT_RING_RADIUS} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="24"
        cy="24"
        r={WAIT_RING_RADIUS}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
        className="stroke-primary"
        strokeDasharray={WAIT_RING_CIRCUMFERENCE}
        strokeDashoffset={depleted ? WAIT_RING_CIRCUMFERENCE : 0}
        style={{ transition: `stroke-dashoffset ${seconds}s linear` }}
      />
    </svg>
  );
}

/** Progreso segmentado (solo `'ejecucion'`): un tramo por paso, con su estado. */
function StepProgress({ total, current }: { readonly total: number; readonly current: number }) {
  return (
    <div data-testid="step-reader-progress" role="list" className="flex gap-1">
      {Array.from({ length: total }, (_, stepIndex) => {
        const state = stepIndex < current ? 'done' : stepIndex === current ? 'current' : 'pending';
        return (
          <span
            key={stepIndex}
            role="listitem"
            data-testid={`step-reader-progress-segment-${stepIndex}`}
            data-state={state}
            className={cn(
              'h-1.5 flex-1 rounded-full bg-muted',
              state === 'done' && 'bg-primary',
              state === 'current' && 'bg-primary/50',
            )}
          />
        );
      })}
    </div>
  );
}

export function StepReader({
  steps,
  onFinish,
  title,
  minStepSeconds,
  mode = 'lectura',
  finishLabel = TEXTS.finish,
  finishBusy = false,
}: StepReaderProps) {
  const isEjecucion = mode === 'ejecucion';
  const baseId = useId();
  const [index, setIndex] = useState(0);
  const [checkedItems, setCheckedItems] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [arrival, setArrival] = useState(0);
  const [waitedArrival, setWaitedArrival] = useState<number | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const skipNextFocus = useRef(true);

  const waitEnabled =
    minStepSeconds !== undefined && Number.isFinite(minStepSeconds) && minStepSeconds > 0;

  const headingId = `${baseId}-title`;
  const reasonId = `${baseId}-reason`;
  const waitReasonId = `${baseId}-wait-reason`;

  // Solo en 'ejecucion': en 'lectura' robar el foco interrumpiria a quien esta editando.
  useEffect(() => {
    if (!isEjecucion) return;
    if (skipNextFocus.current) {
      skipNextFocus.current = false;
      return;
    }
    const heading = headingRef.current;
    heading?.focus();
    if (typeof heading?.scrollIntoView === 'function') {
      heading.scrollIntoView({ block: 'start' });
    }
  }, [arrival, isEjecucion]);

  if (steps.length === 0) {
    // R21: estado vacio explicito y NINGUNA navegacion entre pasos.
    return (
      <section
        data-testid="step-reader"
        aria-labelledby={title === undefined ? undefined : headingId}
        className="flex flex-col gap-4"
      >
        {title !== undefined && (
          <h2 id={headingId} data-testid="step-reader-title" className="text-base font-semibold">
            {title}
          </h2>
        )}
        <p data-testid="step-reader-empty" className="text-base">
          {TEXTS.empty}
        </p>
      </section>
    );
  }

  const currentIndex = Math.min(index, steps.length - 1);
  const current = steps[currentIndex];
  const isLast = currentIndex === steps.length - 1;
  const isFirst = currentIndex === 0;
  const pending = countPendingItems(current, currentIndex, checkedItems);
  const waiting = waitEnabled && waitedArrival !== arrival;
  const blocked = pending > 0 || waiting;
  const reasonIds = [pending > 0 ? reasonId : undefined, waiting ? waitReasonId : undefined]
    .filter((id): id is string => id !== undefined)
    .join(' ');
  const describedBy = reasonIds === '' ? undefined : reasonIds;

  function toggleItem(blockIndex: number, itemIndex: number, checked: boolean) {
    setCheckedItems((previous) => {
      const next = new Set(previous);
      const key = itemKey(currentIndex, blockIndex, itemIndex);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function goPrevious() {
    // En el primer paso, Anterior no retrocede. El boton ya va `disabled`; esto cierra
    // tambien la activacion por programa.
    const next = Math.max(0, currentIndex - 1);
    if (next !== currentIndex) {
      setArrival((previous) => previous + 1);
    }
    setIndex(next);
  }

  function goNext() {
    if (blocked) return;
    const next = Math.min(steps.length - 1, currentIndex + 1);
    if (next !== currentIndex) {
      setArrival((previous) => previous + 1);
    }
    setIndex(next);
  }

  function finish() {
    if (blocked || finishBusy) return;
    onFinish();
  }

  const documentView = (
    <StepDocumentView
      key={currentIndex}
      document={current}
      idPrefix={`${baseId}-${currentIndex}`}
      isItemChecked={(blockIndex, itemIndex) =>
        checkedItems.has(itemKey(currentIndex, blockIndex, itemIndex))
      }
      onToggleItem={toggleItem}
    />
  );

  const waitReason = waiting && (
    <p id={waitReasonId} data-testid="step-reader-wait-reason" className="text-base">
      {isEjecucion && <WaitRing key={`ring-${arrival}`} seconds={minStepSeconds ?? 0} />}
      {TEXTS.waitPrefix}{' '}
      <CountdownTimer key={`timer-${arrival}`} seconds={minStepSeconds} onEnd={() => setWaitedArrival(arrival)} />
      {' '}
      {TEXTS.waitSuffix}
    </p>
  );

  const previousButton = (
    <Button
      type="button"
      variant="outline"
      className={TOUCH_TARGET}
      data-testid="step-reader-previous"
      disabled={isFirst}
      onClick={goPrevious}
    >
      {TEXTS.previous}
    </Button>
  );

  const primaryButton = isLast ? (
    <Button
      type="button"
      className={isEjecucion ? PRIMARY_TOUCH_TARGET_EJECUCION : TOUCH_TARGET}
      data-testid="step-reader-finish"
      disabled={blocked || finishBusy}
      aria-busy={finishBusy || undefined}
      aria-describedby={describedBy}
      onClick={finish}
    >
      {finishLabel}
    </Button>
  ) : (
    <Button
      type="button"
      className={isEjecucion ? PRIMARY_TOUCH_TARGET_EJECUCION : TOUCH_TARGET}
      data-testid="step-reader-next"
      disabled={blocked}
      aria-describedby={describedBy}
      onClick={goNext}
    >
      {TEXTS.next}
    </Button>
  );

  if (isEjecucion) {
    return (
      <section data-testid="step-reader" className="flex flex-col gap-4">
        <div
          ref={headingRef}
          tabIndex={-1}
          data-testid="step-reader-heading"
          className="flex flex-col gap-1 outline-none"
        >
          <StepProgress total={steps.length} current={currentIndex} />

          {title !== undefined && (
            <h2 id={headingId} data-testid="step-reader-title" className="text-xl font-bold sm:text-2xl">
              {title}
            </h2>
          )}

          {/* R27: el cambio de paso se anuncia a la tecnologia de asistencia. */}
          <p
            aria-live="polite"
            data-testid="step-reader-position"
            className="text-sm font-medium text-muted-foreground"
          >
            {TEXTS.position(currentIndex + 1, steps.length)}
          </p>
        </div>

        {documentView}

        {/* Reserva su alto aunque no haya motivo: marcar el ultimo item no debe mover el boton. */}
        <div data-testid="step-reader-reason-slot" className="min-h-6">
          <p
            id={reasonId}
            data-testid="step-reader-blocked-reason"
            className={cn('text-base', pending === 0 && 'invisible')}
          >
            {TEXTS.blocked(pending)}
          </p>
        </div>

        {waitReason}

        <div
          data-testid="step-reader-actions"
          className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-background pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
        >
          {previousButton}
          {primaryButton}
        </div>
      </section>
    );
  }

  return (
    <section data-testid="step-reader" className="flex flex-col gap-4">
      {title !== undefined && (
        <h2 id={headingId} data-testid="step-reader-title" className="text-base font-semibold">
          {title}
        </h2>
      )}

      {/* R27: el cambio de paso se anuncia a la tecnologia de asistencia. */}
      <p
        aria-live="polite"
        data-testid="step-reader-position"
        className="text-base text-muted-foreground"
      >
        {TEXTS.position(currentIndex + 1, steps.length)}
      </p>

      {/* R14: solo `steps[currentIndex]` esta en el DOM; los demas NO se renderizan. */}
      {documentView}

      {pending > 0 && (
        <p id={reasonId} data-testid="step-reader-blocked-reason" className="text-base">
          {TEXTS.blocked(pending)}
        </p>
      )}

      {waitReason}

      <div className="flex flex-wrap items-center gap-2">
        {previousButton}
        {primaryButton}
      </div>
    </section>
  );
}
