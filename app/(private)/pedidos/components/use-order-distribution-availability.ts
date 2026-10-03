'use client';

import { useEffect, useRef, useState } from 'react';

import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import {
  orderPresentationAvailabilitySchema,
  type OrderPresentationAvailability,
  type OrderPresentationLineView,
} from '@/lib/modules/pedidos';
import {
  quoteOrderPresentationAvailabilityAction,
  type OrderPresentationAvailabilityResult,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

export const ORDER_DISTRIBUTION_DEBOUNCE_MS = 400;

/** Una linea del reparto mientras se edita: los envases son el texto del campo, sin convertir. */
export type OrderDistributionLine = {
  readonly presentationId: string;
  readonly presentationName: string | null;
  readonly packages: string;
  /** Contenido por envase; `null` si no lo declara o no se conoce. */
  readonly content: string | null;
  /** Unidad del contenido. `null` = linea guardada, aun sin resolver contra el catalogo. */
  readonly unitId: string | null;
};

export type OrderDistributionAvailability =
  | { readonly status: 'without_unit' }
  | { readonly status: 'idle' }
  | { readonly status: 'quoting' }
  | { readonly status: 'ready'; readonly data: OrderPresentationAvailability }
  | { readonly status: 'error'; readonly error: ErrorState };

export type OrderDistributionAvailabilityInput = {
  readonly quantity: string;
  /** Cadena vacia = el pedido no tiene unidad. */
  readonly unitId: string;
  readonly lines: readonly OrderDistributionLine[];
};

export function fromOrderPresentationLines(
  lines: readonly OrderPresentationLineView[],
): OrderDistributionLine[] {
  return lines.map((line) => ({
    presentationId: line.presentationId,
    presentationName: line.presentationName,
    packages: String(line.packages),
    content: null,
    unitId: null,
  }));
}

/** La forma que piden `presentationLinesSchema` y `updateOrderDistributionAction`. */
export function toPresentationLinesInput(
  lines: readonly OrderDistributionLine[],
): { presentationId: string; packages: string }[] {
  return lines.map((line) => ({ presentationId: line.presentationId, packages: line.packages }));
}

/** Lo que el servidor rechazaria igual al guardar: no se ofrece guardar. */
export function availabilityBlocksSave(availability: OrderDistributionAvailability): boolean {
  if (availability.status !== 'ready') return false;
  const { kind } = availability.data;
  return (
    kind === 'exceeds_quantity' ||
    kind === 'incompatible_units' ||
    kind === 'presentation_without_content'
  );
}

type Settled = { readonly key: string; readonly result: OrderDistributionAvailability };

function unexpectedFromRejection(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: newRequestId(),
  };
}

function toAvailability(result: OrderPresentationAvailabilityResult): OrderDistributionAvailability {
  return result.status === 'success'
    ? { status: 'ready', data: result.data }
    : { status: 'error', error: result };
}

/**
 * El disponible del reparto en la unidad del pedido, recalculado en el servidor tras cada cambio.
 * El estado pintado se deriva de la clave de la entrada vigente: una respuesta de una entrada ya
 * superada no se muestra, y un cambio que deja la entrada sin cotizar no necesita limpiar nada.
 */
export function useOrderDistributionAvailability({
  quantity,
  unitId,
  lines,
}: OrderDistributionAvailabilityInput): OrderDistributionAvailability {
  const [settled, setSettled] = useState<Settled | null>(null);
  const latestKeyRef = useRef<string | null>(null);

  const candidate = { quantity, unitId, presentationLines: toPresentationLinesInput(lines) };
  const parsed = unitId === '' ? null : orderPresentationAvailabilitySchema.safeParse(candidate);
  const key = parsed?.success === true ? JSON.stringify(parsed.data) : null;

  useEffect(() => {
    latestKeyRef.current = key;
    if (key === null) return;

    const input: unknown = JSON.parse(key);
    const timer = setTimeout(() => {
      const settle = (result: OrderDistributionAvailability) => {
        if (latestKeyRef.current === key) setSettled({ key, result });
      };
      Promise.resolve()
        .then(() => quoteOrderPresentationAvailabilityAction(input))
        .then((result) => settle(toAvailability(result)))
        .catch(() => settle({ status: 'error', error: unexpectedFromRejection() }));
    }, ORDER_DISTRIBUTION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [key]);

  if (unitId === '') return { status: 'without_unit' };
  if (key === null) return { status: 'idle' };
  if (settled === null || settled.key !== key) return { status: 'quoting' };
  return settled.result;
}
