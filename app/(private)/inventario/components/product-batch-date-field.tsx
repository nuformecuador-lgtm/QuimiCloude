'use client';

import { CalendarIcon } from 'lucide-react';
import { useId, useState } from 'react';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDateLocalISO, parseDateLocalISO } from '@/lib/shared/ui/date-civil';

/**
 * Campo de fecha de compra del primer lote, en el alta de producto (R1-R5, `design.md > 2`).
 *
 * **Mismas primitivas que `data-table-filter-date.tsx`** (`Popover` + `Calendar`), pero en modo
 * `single` -un unico dia, no un rango- y sin tocar `components/ui/calendar.tsx`: `disabled` es
 * una prop nativa de `DayPicker` que el `Calendar` de shadcn/ui reexporta via `...props`.
 *
 * **El valor VIAJA en un `<input type="hidden">`**, igual que los selectores de autocompletado
 * del panel (`PresentationSelect`, `ProductNamePicker`): el formulario anfitrion es NO
 * controlado (`<form action>`), asi que lo que de verdad llega al `FormData` es este espejo, no
 * el boton del calendario.
 *
 * **Por que no `defaultValue`/`key`, al reves que `ProductField`**: aqui el valor elegido vive en
 * estado de React desde el primer render -el calendario lo necesita para pintar el dia
 * seleccionado-, y ese estado sobrevive a un reenvio fallido sin necesidad de remontar nada: el
 * panel no se cierra (R20) y el componente sigue montado con lo que el usuario ya eligio. La prop
 * `initialValue` solo entra en juego si el panel se vuelve a montar desde cero (p. ej. se cierra y
 * se abre de nuevo): recupera el valor de un intento previo, y si no hay ninguno cae en "hoy"
 * (R2), calculada en hora LOCAL con `formatDateLocalISO`/su inversa -nunca `toISOString()`-.
 */

/** Campo del formulario de producto que alimenta este componente, via su `input` espejo. */
export const PURCHASE_DATE_FIELD = 'purchaseDate';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/**
 * Reexportada para que `product-form.tsx`, que necesita la misma fecha de "hoy" para el valor
 * por defecto, la tome de este componente -su dueño real en esta feature- en vez de importar
 * `lib/shared/ui/date-civil` directamente.
 */
export { formatDateLocalISO };

/** "Hoy" a medianoche local, sin arrastrar la hora (R2, R5). */
function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

type ProductBatchDateFieldProps = {
  /**
   * Fecha ya elegida, en `YYYY-MM-DD` (se recupera tras un fallo). Ausente o vacia = "hoy"
   * (R2).
   */
  readonly initialValue?: string;
  /** Mensaje de error del campo (R3). Se pinta en linea y marca el disparador como invalido. */
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
        Campo espejo: lo que VIAJA en el `FormData` es esta cadena `YYYY-MM-DD`, no el boton del
        calendario. `type="hidden"` -y no `sr-only`, como en los selectores de texto- porque este
        campo no tiene validacion nativa de `required` que conservar: el disparador es un boton,
        no un `<input>` de texto, y `[D9]`/R8 dejan el "obligatorio" al mismo esquema que revalida
        el servidor.
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
          className={`inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted ${TOUCH_TARGET}`}
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
