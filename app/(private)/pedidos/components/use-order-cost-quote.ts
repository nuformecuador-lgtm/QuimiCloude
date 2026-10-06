'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import { quoteOrderCostSchema, type DistributionLineInput } from '@/lib/modules/pedidos';
import {
  quoteOrderCostAction,
  type OrderCostQuoteResult,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

import {
  distributionLinesValid,
  isLegacyLine,
  toDistributionLinesInput,
  type OrderDistributionLine,
} from './use-order-distribution-availability';

/**
 * El rechazo de transporte no trae `code` ni `message` de dominio -no llego a ejecutarse la
 * accion-, asi que aqui no hay traductor de errores de dominio al que delegar (ese vive en el
 * servidor y depende de `next/headers`). Se fabrica el mismo `unexpected` que produciria el
 * servidor: mensaje del catalogo y una referencia nueva para poder citarla al reportar el fallo.
 */
function unexpectedFromRejection(): ErrorState {
  return {
    status: 'error',
    code: UNEXPECTED_ERROR_CODE,
    message: errorMessage(UNEXPECTED_ERROR_CODE),
    reference: newRequestId(),
  };
}

/** Ventana de espera tras la ultima tecla antes de pedir una cotizacion nueva. */
export const ORDER_COST_QUOTE_DEBOUNCE_MS = 500;

export type OrderCostQuoteState = {
  /** Lo que se pinta: `null` es el guion. */
  readonly amount: string | null;
  /** Marca el `aria-busy` del bloque que lo pinta. */
  readonly quoting: boolean;
  /** El rechazo de la ultima cotizacion pedida, o `null` si no fallo. */
  readonly error: ErrorState | null;
};

type OrderCostQuoteHandlers = {
  readonly state: OrderCostQuoteState;
  readonly onRecipeChange: (recipeId: string | null, quantity: string, unitId: string) => void;
  readonly onQuantityChange: (recipeId: string | null, quantity: string, unitId: string) => void;
  /** La cantidad se convierte a la unidad de cada insumo: otra unidad, otro costo. */
  readonly onUnitChange: (recipeId: string | null, quantity: string, unitId: string) => void;
  /** El costo de los envases depende del reparto: cambiarlo vuelve a cotizar. */
  readonly onDistributionChange: (
    recipeId: string | null,
    quantity: string,
    unitId: string,
    lines: readonly OrderDistributionLine[],
  ) => void;
};

function canQuote(
  recipeId: string | null,
  quantity: string,
  unitId: string,
  lines: readonly OrderDistributionLine[],
): recipeId is string {
  return (
    recipeId !== null &&
    distributionLinesValid(lines) &&
    quoteOrderCostSchema.safeParse({
      recipeId,
      quantity,
      unitId,
      presentationLines: toDistributionLinesInput(lines),
    }).success
  );
}

/**
 * Cotizacion del coste de ingredientes del formulario de pedido. Arranca con `initialAmount` -el
 * importe guardado en la edicion, `null` en el alta- y no pide nada al montar: solo los
 * manejadores disparan una peticion, siempre desde el evento que los llama y nunca desde un
 * efecto. `orderId` solo lo pasa la edicion, para que el pedido cuente como disponible lo que el
 * mismo tiene apartado; el alta no lo envia.
 */
export function useOrderCostQuote(
  initialAmount: string | null,
  orderId?: string,
  initialLines: readonly OrderDistributionLine[] = [],
): OrderCostQuoteHandlers {
  const [amount, setAmount] = useState<string | null>(initialAmount);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesRef = useRef<readonly OrderDistributionLine[]>(initialLines);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const request = useCallback((recipeId: string, quantity: string, unitId: string) => {
    const id = ++requestRef.current;
    setQuoting(true);
    setError(null);
    // Las lineas antiguas no tienen envase y no suman costo.
    const presentationLines: DistributionLineInput[] = toDistributionLinesInput(
      linesRef.current.flatMap((line) => (isLegacyLine(line) ? [] : [line])),
    );
    void quoteOrderCostAction({
      recipeId,
      quantity,
      unitId,
      ...(orderId === undefined ? {} : { orderId }),
      ...(presentationLines.length === 0 ? {} : { presentationLines }),
    })
      .then((result: OrderCostQuoteResult) => {
        if (id !== requestRef.current) return;

        setQuoting(false);
        if (result.status === 'success') {
          setAmount(result.data.ingredientsCost);
          setError(null);
          return;
        }
        setAmount(null);
        setError(result);
      })
      .catch(() => {
        if (id !== requestRef.current) return;

        setQuoting(false);
        setAmount(null);
        setError(unexpectedFromRejection());
      });
  }, [orderId]);

  const goToDash = useCallback(() => {
    clearPendingTimer();
    ++requestRef.current;
    setAmount(null);
    setQuoting(false);
    setError(null);
  }, [clearPendingTimer]);

  const quoteNow = useCallback(
    (recipeId: string | null, quantity: string, unitId: string) => {
      clearPendingTimer();
      if (!canQuote(recipeId, quantity, unitId, linesRef.current)) {
        goToDash();
        return;
      }
      request(recipeId, quantity, unitId);
    },
    [clearPendingTimer, goToDash, request],
  );

  const schedule = useCallback(
    (recipeId: string | null, quantity: string, unitId: string) => {
      clearPendingTimer();
      if (!canQuote(recipeId, quantity, unitId, linesRef.current)) {
        goToDash();
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        request(recipeId, quantity, unitId);
      }, ORDER_COST_QUOTE_DEBOUNCE_MS);
    },
    [clearPendingTimer, goToDash, request],
  );

  const onDistributionChange = useCallback(
    (
      recipeId: string | null,
      quantity: string,
      unitId: string,
      lines: readonly OrderDistributionLine[],
    ) => {
      linesRef.current = lines;
      schedule(recipeId, quantity, unitId);
    },
    [schedule],
  );

  return {
    state: { amount, quoting, error },
    onRecipeChange: quoteNow,
    onQuantityChange: schedule,
    onUnitChange: quoteNow,
    onDistributionChange,
  };
}
