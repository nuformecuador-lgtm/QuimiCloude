'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage, UNEXPECTED_ERROR_CODE, type ErrorState } from '@/lib/modules/errores';
import { newRequestId } from '@/lib/modules/observabilidad';
import { quoteOrderCostSchema } from '@/lib/modules/pedidos';
import {
  quoteOrderCostAction,
  type OrderCostQuoteResult,
} from '@/lib/modules/pedidos/adapters/driving/order-actions';

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
  readonly onRecipeChange: (recipeId: string | null, quantity: string) => void;
  readonly onQuantityChange: (recipeId: string | null, quantity: string) => void;
};

function canQuote(recipeId: string | null, quantity: string): recipeId is string {
  return recipeId !== null && quoteOrderCostSchema.safeParse({ recipeId, quantity }).success;
}

/**
 * Cotizacion del coste de ingredientes del formulario de pedido. Arranca con `initialAmount` -el
 * importe guardado en la edicion, `null` en el alta- y no pide nada al montar: solo los dos
 * manejadores disparan una peticion, siempre desde el evento que los llama y nunca desde un
 * efecto. `orderId` solo lo pasa la edicion, para que el pedido cuente como disponible lo que el
 * mismo tiene apartado; el alta no lo envia.
 */
export function useOrderCostQuote(
  initialAmount: string | null,
  orderId?: string,
): OrderCostQuoteHandlers {
  const [amount, setAmount] = useState<string | null>(initialAmount);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const request = useCallback((recipeId: string, quantity: string) => {
    const id = ++requestRef.current;
    setQuoting(true);
    setError(null);
    void quoteOrderCostAction(orderId === undefined ? { recipeId, quantity } : { recipeId, quantity, orderId })
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

  const onRecipeChange = useCallback(
    (recipeId: string | null, quantity: string) => {
      clearPendingTimer();
      if (!canQuote(recipeId, quantity)) {
        goToDash();
        return;
      }
      request(recipeId, quantity);
    },
    [clearPendingTimer, goToDash, request],
  );

  const onQuantityChange = useCallback(
    (recipeId: string | null, quantity: string) => {
      clearPendingTimer();
      if (!canQuote(recipeId, quantity)) {
        goToDash();
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        request(recipeId, quantity);
      }, ORDER_COST_QUOTE_DEBOUNCE_MS);
    },
    [clearPendingTimer, goToDash, request],
  );

  return { state: { amount, quoting, error }, onRecipeChange, onQuantityChange };
}
