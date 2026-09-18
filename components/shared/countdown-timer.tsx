'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * Cronometro compartido: `MM:SS` que cuenta hacia atras y avisa al llegar a cero.
 *
 * **El resto se calcula contra un instante de fin (`Date.now() + total`), no restando un
 * segundo por tick.** Un `setInterval` de 1000 ms no dispara cada 1000 ms exactos -una pestaña
 * en segundo plano lo retrasa-, y decrementar un contador local acumularia esa deriva. Comparar
 * siempre contra el instante de fin la corrige sola en cada tick.
 *
 * **`onEnd` vive en un ref, actualizado en su propio efecto.** Si el padre pasa una funcion
 * nueva en cada render -lo habitual con una arrow function inline-, guardarla en el efecto del
 * conteo reiniciaria el intervalo cada vez que el padre se re-renderiza.
 *
 * **El reinicio al cambiar `minutes`/`seconds` ocurre durante el render, no en un efecto**: se
 * compara el total normalizado contra el ultimo que se vio y, si difiere, se ajusta el estado ahi
 * mismo. Hacerlo en un efecto forzaria un segundo render en cascada solo para sincronizar un
 * valor que ya se conoce al renderizar.
 *
 * **Solo tokens del tema** (`app/globals.css`): sin colores sueltos. El aviso de los ultimos
 * segundos reutiliza `text-destructive`, el mismo tono que ya usan los errores del formulario.
 */

const MAX_TOTAL_SECONDS = 99 * 60 + 59;

/** A partir de aqui el conteo se pinta con el tono de aviso (tokens del tema, nada hardcodeado). */
const LOW_TIME_THRESHOLD_SECONDS = 10;

export type CountdownTimerProps = {
  readonly minutes?: number;
  readonly seconds?: number;
  /** Se llama exactamente una vez, al llegar a 00:00 (o de inmediato si el total ya es 0). */
  readonly onEnd: () => void;
  readonly className?: string;
};

function normalizeTotalSeconds(minutes: number, seconds: number): number {
  const safeMinutes = Number.isFinite(minutes) ? Math.trunc(minutes) : 0;
  const safeSeconds = Number.isFinite(seconds) ? Math.trunc(seconds) : 0;
  const total = safeMinutes * 60 + safeSeconds;
  return Math.min(Math.max(total, 0), MAX_TOTAL_SECONDS);
}

function formatRemaining(totalSeconds: number): string {
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function CountdownTimer({ minutes = 0, seconds = 0, onEnd, className }: CountdownTimerProps) {
  const total = normalizeTotalSeconds(minutes, seconds);
  const [remaining, setRemaining] = useState(total);
  const [lastTotal, setLastTotal] = useState(total);
  const onEndRef = useRef(onEnd);

  useEffect(() => {
    onEndRef.current = onEnd;
  });

  if (total !== lastTotal) {
    setLastTotal(total);
    setRemaining(total);
  }

  useEffect(() => {
    if (total === 0) {
      onEndRef.current();
      return;
    }

    const endAt = Date.now() + total * 1000;
    let ended = false;

    const intervalId = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !ended) {
        ended = true;
        clearInterval(intervalId);
        onEndRef.current();
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [total]);

  const formatted = formatRemaining(remaining);
  const isLow = remaining <= LOW_TIME_THRESHOLD_SECONDS;

  return (
    <span
      role="timer"
      aria-label={`Tiempo restante: ${formatted}`}
      className={cn(
        'tabular-nums font-medium text-foreground',
        isLow && 'text-destructive',
        className,
      )}
      data-testid="countdown-timer"
    >
      {formatted}
    </span>
  );
}
