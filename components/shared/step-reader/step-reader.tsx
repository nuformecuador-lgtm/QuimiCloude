'use client';

import { useId, useState } from 'react';

import { CountdownTimer } from '@/components/shared/countdown-timer';
import { Button } from '@/components/ui/button';
import type { RecipeStepDocument } from '@/lib/modules/recetas';

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
 * Los textos viven en UNA constante para que la i18n futura sea sustituirla: la API de R20 es
 * cerrada y no admite props de copy.
 */

/** Objetivo tactil minimo (R26). Misma clase que ya usa el resto del repo. */
const TOUCH_TARGET = 'min-h-11 min-w-11';

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

export function StepReader({ steps, onFinish, title, minStepSeconds }: StepReaderProps) {
  const baseId = useId();
  const [index, setIndex] = useState(0);
  const [checkedItems, setCheckedItems] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [arrival, setArrival] = useState(0);
  const [waitedArrival, setWaitedArrival] = useState<number | null>(null);

  const waitEnabled =
    minStepSeconds !== undefined && Number.isFinite(minStepSeconds) && minStepSeconds > 0;

  const headingId = `${baseId}-title`;
  const reasonId = `${baseId}-reason`;
  const waitReasonId = `${baseId}-wait-reason`;

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
    if (blocked) return;
    onFinish();
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
      <StepDocumentView
        key={currentIndex}
        document={current}
        idPrefix={`${baseId}-${currentIndex}`}
        isItemChecked={(blockIndex, itemIndex) =>
          checkedItems.has(itemKey(currentIndex, blockIndex, itemIndex))
        }
        onToggleItem={toggleItem}
      />

      {pending > 0 && (
        <p id={reasonId} data-testid="step-reader-blocked-reason" className="text-base">
          {TEXTS.blocked(pending)}
        </p>
      )}

      {waiting && (
        <p id={waitReasonId} data-testid="step-reader-wait-reason" className="text-base">
          {TEXTS.waitPrefix}{' '}
          <CountdownTimer
            key={arrival}
            seconds={minStepSeconds}
            onEnd={() => setWaitedArrival(arrival)}
          />{' '}
          {TEXTS.waitSuffix}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
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

        {isLast ? (
          <Button
            type="button"
            className={TOUCH_TARGET}
            data-testid="step-reader-finish"
            disabled={blocked}
            aria-describedby={describedBy}
            onClick={finish}
          >
            {TEXTS.finish}
          </Button>
        ) : (
          <Button
            type="button"
            className={TOUCH_TARGET}
            data-testid="step-reader-next"
            disabled={blocked}
            aria-describedby={describedBy}
            onClick={goNext}
          >
            {TEXTS.next}
          </Button>
        )}
      </div>
    </section>
  );
}
