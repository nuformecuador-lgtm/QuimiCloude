'use client';

import { useId, useState, type ReactNode } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { touchTarget } from '@/lib/shared/ui/touch-target';
import { CircleAlertIcon } from 'lucide-react';

const FIELD_TEXT = 'text-base md:text-base';

type SharedSelectOption = {
  readonly value: string;
  readonly label: string;
};

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

      <Select
        name={name}
        value={selectedValue}
        onValueChange={(value) => {
          setSelectedValue(value);
          if (value !== null && onChange) onChange(value);
        }}
        required={required}
        data-testid={`shared-select-${name}`}
      >
        <SelectTrigger
          id={inputId}
          className={`${touchTarget} ${FIELD_TEXT} w-full`}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
        >
          <span className={selectedValue ? '' : 'text-muted-foreground'}>
            {displayValue}
          </span>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`shared-select-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}