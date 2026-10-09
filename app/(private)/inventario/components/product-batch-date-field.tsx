'use client';

import { CalendarIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDateLocalISO, parseDateLocalISO } from '@/lib/shared/ui/date-civil';
import { touchTarget } from '@/lib/shared/ui/touch-target';

/**
 * Campo de fecha de compra del primer lote, en el alta de producto.
 *
 * Mismas primitivas que `data-table-filter-date.tsx` (`Popover` + `Calendar`), en modo `single`
 * y sin tocar `components/ui/calendar.tsx`: `disabled` es prop nativa de `DayPicker`, que el
 * `Calendar` de shadcn/ui reexporta via `...props`.
 *
 * El valor viaja en un `<input type="hidden">`, como los selectores de autocompletado del panel:
 * el formulario anfitrion es NO controlado, asi que lo que llega al `FormData` es este espejo y
 * no el boton del calendario.
 *
 * Sin `defaultValue`/`key`, al reves que `ProductField`: el dia elegido vive en estado de React
 * desde el primer render -el calendario lo necesita para pintarlo- y sobrevive a un reenvio
 * fallido sin remontar nada. `initialValue` solo entra si el panel se remonta desde cero.
 */

/** Campo del formulario de producto que alimenta este componente, via su `input` espejo. */
export const PURCHASE_DATE_FIELD = 'purchaseDate';

/** "Hoy" a medianoche local, sin arrastrar la hora. */
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type ProductBatchDateFieldProps = {
  /** Fecha ya elegida, en `YYYY-MM-DD`. Ausente o vacia = "hoy". */
  readonly initialValue?: string;
  /** Mensaje de error del campo. Se pinta en linea y marca el disparador como invalido. */
  readonly error?: string;
};

export function ProductBatchDateField({ initialValue, error }: ProductBatchDateFieldProps) {
  const labelId = useId();
  const errorId = useId();
  const hoy = today();

  const [selected, setSelected] = useState<Date>(() =>
    initialValue === undefined || initialValue === '' ? hoy : parseDateLocalISO(initialValue),
  );

  const value = formatDateLocalISO(selected);

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        Fecha de compra
      </span>

      {/*
        `type="hidden"` y no `sr-only`, como en los selectores de texto: aqui no hay validacion
        nativa de `required` que conservar -el disparador es un boton, no un `<input>` de texto- y
        el "obligatorio" queda en el esquema que revalida el servidor.
      */}
      <input
        type="hidden"
        name={PURCHASE_DATE_FIELD}
        value={value}
        onChange={() => undefined}
        data-testid="product-batch-date-value"
      />

      <Popover>
        <PopoverTrigger
          type="button"
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted ${touchTarget}`}
          data-testid="product-field-purchaseDate"
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
          {value}
        </PopoverTrigger>

        <PopoverContent className="w-auto">
          <Calendar
            mode="single"
            selected={selected}
            disabled={{ after: hoy }}
            onSelect={(date) => {
              if (date === undefined) return;
              setSelected(date);
            }}
          />
        </PopoverContent>
      </Popover>

      {error === undefined ? null : (
        <p
          id={errorId}
          className="text-sm text-destructive"
          data-testid="product-error-purchaseDate"
        >
          {error}
        </p>
      )}
    </div>
  );
}
