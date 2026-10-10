'use client';

import { useId, type ReactNode } from 'react';

import { FieldError } from './field-error';
import {
  SharedSelectControl,
  type SharedSelectNoneOption,
  type SharedSelectOption,
} from './shared-select';

export type SelectFieldProps = {
  readonly name: string;
  readonly label: ReactNode;
  /** La lista que llega es la que se pinta: sin opciones no se inventa ninguna. */
  readonly options: readonly SharedSelectOption[];
  readonly noneOption?: SharedSelectNoneOption;
  readonly defaultValue?: string;
  readonly remountOnDefault?: boolean;
  readonly required?: boolean;
  readonly labelId?: string;
  readonly errorId?: string;
  readonly triggerTestId?: string;
  readonly triggerClassName?: string;
  readonly optionTestId?: string;
  readonly optionValueAttribute?: boolean;
  readonly error?: string;
  readonly errorTestId?: string;
  readonly errorAlert?: boolean;
};

/**
 * Etiqueta, select no controlado y error. La etiqueta es un `span` que nombra al disparador por
 * `aria-labelledby`: el disparador es un botón, no un control que un `<label>` pueda enfocar.
 */
export function SelectField({
  name,
  label,
  options,
  noneOption,
  defaultValue,
  remountOnDefault,
  required,
  labelId,
  errorId,
  triggerTestId,
  triggerClassName,
  optionTestId,
  optionValueAttribute,
  error,
  errorTestId,
  errorAlert = true,
}: SelectFieldProps) {
  const generatedLabelId = useId();
  const generatedErrorId = useId();
  const resolvedLabelId = labelId ?? generatedLabelId;
  const resolvedErrorId = errorId ?? generatedErrorId;

  return (
    <div className="flex flex-col gap-2">
      <span id={resolvedLabelId} className="text-sm font-medium">
        {label}
      </span>
      <SharedSelectControl
        name={name}
        options={options}
        noneOption={noneOption}
        defaultValue={defaultValue}
        remountOnDefault={remountOnDefault}
        required={required}
        labelledBy={resolvedLabelId}
        invalid={error !== undefined}
        describedBy={error === undefined ? undefined : resolvedErrorId}
        triggerClassName={triggerClassName}
        triggerTestId={triggerTestId}
        optionTestId={optionTestId}
        optionValueAttribute={optionValueAttribute}
      />
      <FieldError id={resolvedErrorId} message={error} testId={errorTestId} alert={errorAlert} />
    </div>
  );
}
