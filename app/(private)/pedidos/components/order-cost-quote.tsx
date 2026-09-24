'use client';

import { UnexpectedErrorNotice } from '@/components/shared/unexpected-error-notice';
import { UNEXPECTED_ERROR_CODE } from '@/lib/modules/errores';

import { formatOrderAmount, orderAmountTitle } from './order-amount';
import { MISSING_VALUE_MARK } from './order-columns';
import type { OrderCostQuoteState } from './use-order-cost-quote';

export const ORDER_COST_QUOTE_TESTID = 'order-cost-quote';
export const ORDER_COST_QUOTE_VALUE_TESTID = 'order-cost-quote-value';
export const ORDER_COST_QUOTE_QUOTING_TESTID = 'order-cost-quote-quoting';
export const ORDER_COST_QUOTE_ERROR_TESTID = 'order-cost-quote-error';

/** Copy no afirmado por ningun test: van por `data-testid`. */
const QUOTE_LABEL = 'Coste estimado de ingredientes';
const QUOTING_LABEL = 'cotizando…';
const ERROR_PREFIX = 'No se pudo cotizar:';

function quoteDataState({ error, quoting }: OrderCostQuoteState): 'idle' | 'quoting' | 'error' {
  if (error !== null) return 'error';
  return quoting ? 'quoting' : 'idle';
}

/** El bloque de coste del formulario de pedido: presentacional, todo llega por props. */
export function OrderCostQuote(props: OrderCostQuoteState) {
  const { amount, quoting, error } = props;

  return (
    <div
      className="flex flex-col gap-1"
      data-testid={ORDER_COST_QUOTE_TESTID}
      data-state={quoteDataState(props)}
      aria-busy={quoting}
    >
      <span className="text-sm font-medium">{QUOTE_LABEL}</span>
      <div role="status" aria-live="polite" className="flex flex-col gap-1 text-sm">
        <div className="flex items-center gap-1.5">
          {amount !== null ? (
            <span
              className={quoting ? 'opacity-60' : undefined}
              title={orderAmountTitle(amount)}
              data-testid={ORDER_COST_QUOTE_VALUE_TESTID}
            >
              {formatOrderAmount(amount)}
            </span>
          ) : error === null && !quoting ? (
            <span data-testid={ORDER_COST_QUOTE_VALUE_TESTID}>{MISSING_VALUE_MARK}</span>
          ) : null}
          {quoting ? (
            <span className="text-muted-foreground" data-testid={ORDER_COST_QUOTE_QUOTING_TESTID}>
              {QUOTING_LABEL}
            </span>
          ) : null}
        </div>
        {error === null ? null : (
          <div className="text-destructive" data-testid={ORDER_COST_QUOTE_ERROR_TESTID}>
            {error.code === UNEXPECTED_ERROR_CODE ? (
              <UnexpectedErrorNotice state={error} />
            ) : (
              <span>{`${ERROR_PREFIX} ${error.message}`}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
