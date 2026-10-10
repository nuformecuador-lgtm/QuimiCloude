'use client';

import { DatePicker } from '@/components/shared/date-picker';
import { parseDateLocalISO } from '@/lib/shared/ui/date-civil';

/** Campo del formulario de producto que alimenta este componente, via su `input` espejo. */
export const PURCHASE_DATE_FIELD = 'purchaseDate';

const LABEL = 'Fecha de compra';

/** "Hoy" a medianoche local, sin arrastrar la hora. */
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type ProductBatchDateFieldProps = {
  /** Fecha ya elegida, en `YYYY-MM-DD`. Ausente o vacia = "hoy". */
  readonly initialValue?: string;
  readonly error?: string;
};

/**
 * Fecha de compra del primer lote, en el alta de producto. No admite dias futuros. El dia elegido
 * vive en estado desde el primer render y sobrevive a un reenvio fallido sin remontar nada:
 * `initialValue` solo cuenta si el panel se remonta desde cero.
 */
export function ProductBatchDateField({ initialValue, error }: ProductBatchDateFieldProps) {
  const hoy = today();

  return (
    <DatePicker
      mode="single"
      name={PURCHASE_DATE_FIELD}
      label={LABEL}
      defaultValue={
        initialValue === undefined || initialValue === '' ? hoy : parseDateLocalISO(initialValue)
      }
      disabled={{ after: hoy }}
      triggerTestId="product-field-purchaseDate"
      valueTestId="product-batch-date-value"
      error={error}
      errorTestId="product-error-purchaseDate"
      errorAlert={false}
    />
  );
}
