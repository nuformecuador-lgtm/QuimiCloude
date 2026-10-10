'use client';

import { CalendarIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import type { DateRange, Matcher } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDateLocalISO } from '@/lib/shared/ui/date-civil';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { cn } from '@/lib/utils';

import { FieldError } from './field-error';

const TRIGGER_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-muted';

type DatePickerSingleProps = {
  readonly mode: 'single';
  readonly name: string;
  readonly label: ReactNode;
  /** Solo se lee al montar: el día elegido vive después en estado. */
  readonly defaultValue: Date;
  readonly disabled?: Matcher | Matcher[];
  readonly triggerTestId?: string;
  readonly valueTestId?: string;
  readonly error?: string;
  readonly errorTestId?: string;
  readonly errorAlert?: boolean;
};

type DatePickerRangeProps = {
  readonly mode: 'range';
  /** Contenido del disparador, detrás del icono. */
  readonly triggerContent: ReactNode;
  readonly selected: DateRange | undefined;
  readonly onSelect: (range: DateRange | undefined) => void;
  readonly numberOfMonths?: number;
  /** Va encima del calendario (p. ej. atajos). */
  readonly header?: ReactNode;
  readonly triggerTestId?: string;
};

export type DatePickerProps = DatePickerSingleProps | DatePickerRangeProps;

export function DatePicker(props: DatePickerProps) {
  return props.mode === 'single' ? <SingleDatePicker {...props} /> : <RangeDatePicker {...props} />;
}

/**
 * Fecha suelta de un formulario no controlado: lo que llega al `FormData` es el `input` oculto,
 * no el botón del calendario. `type="hidden"` porque el disparador no es un `<input>` y no hay
 * validación nativa que conservar.
 */
function SingleDatePicker({
  name,
  label,
  defaultValue,
  disabled,
  triggerTestId,
  valueTestId,
  error,
  errorTestId,
  errorAlert = true,
}: DatePickerSingleProps) {
  const labelId = useId();
  const errorId = useId();
  const [selected, setSelected] = useState<Date>(defaultValue);
  const value = formatDateLocalISO(selected);

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium">
        {label}
      </span>

      <input
        type="hidden"
        name={name}
        value={value}
        onChange={() => undefined}
        data-testid={valueTestId}
      />

      <Popover>
        <PopoverTrigger
          type="button"
          aria-labelledby={labelId}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          className={cn(TRIGGER_CLASS, touchTarget)}
          data-testid={triggerTestId}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
          {value}
        </PopoverTrigger>

        <PopoverContent className="w-auto">
          <Calendar
            mode="single"
            selected={selected}
            disabled={disabled}
            onSelect={(date) => {
              if (date === undefined) return;
              setSelected(date);
            }}
          />
        </PopoverContent>
      </Popover>

      <FieldError id={errorId} message={error} testId={errorTestId} alert={errorAlert} />
    </div>
  );
}

function RangeDatePicker({
  triggerContent,
  selected,
  onSelect,
  numberOfMonths,
  header,
  triggerTestId,
}: DatePickerRangeProps) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(TRIGGER_CLASS, touchTarget)}
        data-testid={triggerTestId}
      >
        <CalendarIcon className="size-4" aria-hidden="true" />
        {triggerContent}
      </PopoverTrigger>

      <PopoverContent className="w-auto">
        {header}
        <Calendar
          mode="range"
          numberOfMonths={numberOfMonths}
          selected={selected}
          onSelect={onSelect}
        />
      </PopoverContent>
    </Popover>
  );
}
