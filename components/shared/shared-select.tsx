'use client';

import { useId, useState, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { CircleAlertIcon } from 'lucide-react';

import { FieldError } from './field-error';

const FIELD_TEXT = 'text-base md:text-base';

export const SHARED_SELECT_TRIGGER_CLASS = `w-full ${touchTarget} ${FIELD_TEXT}`;

export type SharedSelectOption = {
  readonly value: string;
  readonly label: string;
};

/** Opción que se elige a propósito para «ninguna», distinta de no haber elegido nada. */
export type SharedSelectNoneOption = SharedSelectOption & {
  readonly testId?: string;
};

export type SharedSelectControlProps = {
  readonly name: string;
  readonly options: readonly SharedSelectOption[];
  readonly noneOption?: SharedSelectNoneOption;
  /** No controlado: el valor viaja en el `FormData` por el `input` oculto del primitivo. */
  readonly defaultValue?: string;
  /** Controlado; `null` es «sin elegir». */
  readonly value?: string | null;
  readonly onValueChange?: (value: string | null) => void;
  /** Remonta el select cuando cambia `defaultValue`, como al volver de un envío rechazado. */
  readonly remountOnDefault?: boolean;
  readonly required?: boolean;
  readonly triggerId?: string;
  readonly triggerClassName?: string;
  readonly triggerTestId?: string;
  readonly labelledBy?: string;
  readonly describedBy?: string;
  readonly invalid?: boolean;
  readonly optionTestId?: string;
  /** Repite el valor de cada opción en `data-value`. */
  readonly optionValueAttribute?: boolean;
  /** Contenido del disparador; por defecto, la etiqueta de la opción elegida. */
  readonly children?: ReactNode;
  readonly rootTestId?: string;
};

export function SharedSelectControl({
  name,
  options,
  noneOption,
  defaultValue,
  value,
  onValueChange,
  remountOnDefault = false,
  required,
  triggerId,
  triggerClassName = SHARED_SELECT_TRIGGER_CLASS,
  triggerTestId,
  labelledBy,
  describedBy,
  invalid = false,
  optionTestId,
  optionValueAttribute = false,
  children,
  rootTestId,
}: SharedSelectControlProps) {
  // Las `items` solo las lee `SelectValue` para pintar la etiqueta; con contenido propio sobran.
  const items =
    children === undefined
      ? [...(noneOption === undefined ? [] : [noneOption]), ...options].map((option) => ({
          label: option.label,
          value: option.value,
        }))
      : undefined;

  return (
    <Select
      key={remountOnDefault ? defaultValue : undefined}
      name={name}
      {...(value === undefined ? {} : { value })}
      {...(defaultValue === undefined ? {} : { defaultValue })}
      {...(items === undefined ? {} : { items })}
      {...(onValueChange === undefined ? {} : { onValueChange })}
      {...(required === undefined ? {} : { required })}
      {...(rootTestId === undefined ? {} : { 'data-testid': rootTestId })}
    >
      <SelectTrigger
        id={triggerId}
        aria-labelledby={labelledBy}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={triggerClassName}
        data-testid={triggerTestId}
      >
        {children ?? <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {noneOption === undefined ? null : (
          <SelectItem value={noneOption.value} data-testid={noneOption.testId}>
            {noneOption.label}
          </SelectItem>
        )}
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            data-testid={optionTestId}
            data-value={optionValueAttribute ? option.value : undefined}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type SharedSelectProps = {
  readonly name: string;
  readonly label: string;
  readonly required?: boolean;
  readonly helper?: ReactNode;
  readonly defaultValue?: string;
  readonly error?: string;
  readonly options: readonly SharedSelectOption[];
  readonly onChange?: (value: string) => void;
  readonly placeholder?: string;
};

export function SharedSelect({
  name,
  label,
  required,
  helper,
  defaultValue,
  error,
  options,
  onChange,
  placeholder = 'Selecciona una opción',
}: SharedSelectProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-${name}`;
  const errorId = `${inputId}-error`;
  const [selectedValue, setSelectedValue] = useState<string | null>(defaultValue ?? null);

  const selectedOption = selectedValue ? options.find((opt) => opt.value === selectedValue) : null;
  const displayValue = selectedOption?.label ?? placeholder;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={inputId}>{label}</Label>
        {helper === undefined ? null : (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Qué es ${label}`}
                  className={`flex ${touchTarget} shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                  data-testid={`shared-select-helper-${name}`}
                />
              }
            >
              <CircleAlertIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent data-testid={`shared-select-helper-text-${name}`}>{helper}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <SharedSelectControl
        name={name}
        options={options}
        value={selectedValue}
        onValueChange={(value) => {
          setSelectedValue(value);
          if (value !== null && onChange) onChange(value);
        }}
        required={required}
        rootTestId={`shared-select-${name}`}
        triggerId={inputId}
        triggerClassName={`${touchTarget} ${FIELD_TEXT} w-full`}
        invalid={error !== undefined}
        describedBy={error === undefined ? undefined : errorId}
      >
        <span className={selectedValue ? '' : 'text-muted-foreground'}>
          {displayValue}
        </span>
      </SharedSelectControl>

      <FieldError
        id={errorId}
        message={error}
        testId={`shared-select-error-${name}`}
        alert={false}
      />
    </div>
  );
}
