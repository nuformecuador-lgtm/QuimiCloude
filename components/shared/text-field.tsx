'use client';

import type {
  ChangeEvent,
  ChangeEventHandler,
  FocusEventHandler,
  HTMLAttributes,
  ReactNode,
} from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { FieldError } from './field-error';

/** 44 px de alto y 16 px de letra en todos los anchos: por debajo, Safari en iOS hace zoom. */
const DEFAULT_INPUT_CLASS = 'min-h-11 text-base md:text-base';
const DEFAULT_LABEL_ROW_CLASS = 'flex items-center gap-1.5';

export type TextFieldProps = {
  /** Id del `input`; de el salen el de la ayuda y el del error si no se dan. */
  readonly id: string;
  /** Sin `name` el valor no viaja en el `FormData`. */
  readonly name?: string;
  readonly label: ReactNode;
  readonly type?: 'text' | 'email' | 'tel' | 'date' | 'number';
  readonly defaultValue?: string;
  /** Con `value` el campo pasa a controlado y `defaultValue` se ignora. */
  readonly value?: string;
  readonly onValueChange?: (value: string) => void;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
  readonly onBlur?: FocusEventHandler<HTMLInputElement>;
  /**
   * Remonta el `input` cuando cambia `defaultValue`: Base UI avisa si el valor inicial de un campo
   * no controlado cambia tras montarse, como al volver de un envío rechazado. Sin efecto controlado.
   */
  readonly remountOnDefault?: boolean;
  readonly required?: boolean;
  readonly ariaRequired?: boolean;
  readonly inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  readonly autoComplete?: string;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly step?: string | number;
  readonly min?: string | number;
  readonly testId?: string;
  readonly inputClassName?: string;
  /** Envuelve la etiqueta en una fila; `labelAdornment` va a su derecha (p. ej. un botón de ayuda). */
  readonly labelRowClassName?: string;
  readonly labelAdornment?: ReactNode;
  /** Pinta el `input` en una fila con este contenido detrás (p. ej. la unidad). */
  readonly suffix?: ReactNode;
  readonly suffixRowClassName?: string;
  readonly hint?: ReactNode;
  readonly hintId?: string;
  /** Por defecto el `aria-describedby` solo apunta al error. */
  readonly describeHint?: boolean;
  readonly error?: string;
  readonly errorId?: string;
  readonly errorTestId?: string;
  readonly errorAlert?: boolean;
  /** Va después del error. */
  readonly children?: ReactNode;
};

function joinIds(ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((value): value is string => value !== undefined);
  return present.length === 0 ? undefined : present.join(' ');
}

export function TextField({
  id,
  name,
  label,
  type = 'text',
  defaultValue,
  value,
  onValueChange,
  onChange,
  onBlur,
  remountOnDefault = false,
  required,
  ariaRequired,
  inputMode,
  autoComplete,
  maxLength,
  pattern,
  step,
  min,
  testId,
  inputClassName = DEFAULT_INPUT_CLASS,
  labelRowClassName,
  labelAdornment,
  suffix,
  suffixRowClassName = 'flex items-center gap-2',
  hint,
  hintId = `${id}-hint`,
  describeHint = false,
  error,
  errorId = `${id}-error`,
  errorTestId,
  errorAlert = true,
  children,
}: TextFieldProps) {
  const controlled = value !== undefined;
  const hasHint = hint !== undefined && hint !== null;

  const handleChange =
    onChange === undefined && onValueChange === undefined
      ? undefined
      : (event: ChangeEvent<HTMLInputElement>) => {
          onChange?.(event);
          onValueChange?.(event.currentTarget.value);
        };

  const labelNode = <Label htmlFor={id}>{label}</Label>;
  const withLabelRow = labelRowClassName !== undefined || labelAdornment !== undefined;

  const input = (
    <Input
      key={remountOnDefault && !controlled ? defaultValue : undefined}
      id={id}
      name={name}
      type={type}
      inputMode={inputMode}
      autoComplete={autoComplete}
      required={required}
      aria-required={ariaRequired}
      maxLength={maxLength}
      pattern={pattern}
      step={step}
      min={min}
      value={value}
      defaultValue={controlled ? undefined : defaultValue}
      onChange={handleChange}
      onBlur={onBlur}
      className={inputClassName}
      aria-invalid={error === undefined ? undefined : true}
      aria-describedby={joinIds([
        hasHint && describeHint ? hintId : undefined,
        error === undefined ? undefined : errorId,
      ])}
      data-testid={testId}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {withLabelRow ? (
        <div className={labelRowClassName ?? DEFAULT_LABEL_ROW_CLASS}>
          {labelNode}
          {labelAdornment}
        </div>
      ) : (
        labelNode
      )}

      {suffix === undefined ? (
        input
      ) : (
        <div className={suffixRowClassName}>
          {input}
          {suffix}
        </div>
      )}

      {hasHint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}

      <FieldError id={errorId} message={error} testId={errorTestId} alert={errorAlert} />

      {children}
    </div>
  );
}
