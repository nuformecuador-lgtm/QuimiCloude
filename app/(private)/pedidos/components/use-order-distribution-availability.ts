'use client';

import { useEffect, useRef, useState } from 'react';

import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import {
  orderPresentationAvailabilitySchema,
  presentationLinesSchema,
  type DistributionLineInput,
  type OrderPresentationAvailabilityNext,
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
  /** Ausente o `null` = linea antigua, guardada antes de repartir en envases. */
  readonly packagingProductId?: string | null;
  readonly packagingName?: string | null;
  /** Disponible del envase cuando se eligio; `null` si no se conoce. */
  readonly available?: string | null;
};

export type OrderDistributionAvailability =
  | { readonly status: 'without_unit' }
  | { readonly status: 'idle' }
  | { readonly status: 'quoting' }
  | { readonly status: 'ready'; readonly data: OrderPresentationAvailabilityNext }
  | { readonly status: 'error'; readonly error: ErrorState };

export function isLegacyLine(line: OrderDistributionLine): boolean {
  return line.packagingProductId === undefined || line.packagingProductId === null;
}

/** Identidad de la linea dentro del reparto: el envase o, en una antigua, su presentacion. */
export function lineKey(line: OrderDistributionLine): string {
  return line.packagingProductId ?? line.presentationId;
}

/**
 * La forma la valida el esquema del contrato. Dos envases con la misma presentacion solo los ve
 * el servidor al resolverlos; aqui ya se conoce la presentacion y se rechaza antes.
 */
export function distributionLinesValid(lines: readonly OrderDistributionLine[]): boolean {
  return (
    hasUniquePresentations(lines) &&
    presentationLinesSchema.safeParse(toDistributionLinesInput(lines)).success
  );
}

// Leidas del formulario, las lineas de envase llegan sin presentacion (''): no cuentan como repetidas.
function hasUniquePresentations(lines: readonly OrderDistributionLine[]): boolean {
  const known = lines.map((line) => line.presentationId).filter((id) => id !== '');
  return new Set(known).size === known.length;
}

/** Las lineas con los envases ya como numero, para las consultas al servidor. */
export function toDistributionLinesInput(
  lines: readonly OrderDistributionLine[],
): DistributionLineInput[] {
  return lines.map((line) =>
    isLegacyLine(line)
      ? { presentationId: line.presentationId, packages: Number(line.packages) }
      : { packagingProductId: line.packagingProductId ?? '', packages: Number(line.packages) },
  );
}

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
    packagingProductId: line.packagingProductId ?? null,
    packagingName: line.packagingName ?? null,
    available: null,
  }));
}

/** La forma que pide `updateOrderDistributionAction`: una linea antigua viaja por su presentacion. */
export function toPresentationLinesInput(
  lines: readonly OrderDistributionLine[],
): ({ packagingProductId: string; packages: string } | { presentationId: string; packages: string })[] {
  return lines.map((line) =>
    isLegacyLine(line)
      ? { presentationId: line.presentationId, packages: line.packages }
      : { packagingProductId: line.packagingProductId ?? '', packages: line.packages },
  );
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

/** `null` = la entrada no tiene forma valida y no se pregunta al servidor. */
function availabilityKey(
  quantity: string,
  unitId: string,
  lines: readonly OrderDistributionLine[],
): string | null {
  if (!hasUniquePresentations(lines)) return null;
  const parsed = orderPresentationAvailabilitySchema.safeParse({
    quantity,
    unitId,
    presentationLines: toDistributionLinesInput(lines),
  });
  return parsed.success ? JSON.stringify(parsed.data) : null;
}

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

  const key = unitId === '' ? null : availabilityKey(quantity, unitId, lines);

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
