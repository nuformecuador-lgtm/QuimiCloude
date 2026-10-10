'use client';

import { useId } from 'react';

import { TextField } from '@/components/shared/text-field';

/** Alto tactil minimo de 44 px. Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11';

/** 16 px en todos los anchos: por debajo, Safari en iOS hace zoom al enfocar. */
const FIELD_TEXT = 'text-base md:text-base';

type SupplierFieldProps = {
  /** Nombre del campo en el `FormData`. De el salen tambien los `data-testid`. */
  readonly name: string;
  readonly label: string;
  readonly required?: boolean;
  readonly defaultValue: string;
  readonly error?: string;
  /** Teclado del movil. NO cambia el `type`, que es siempre `text` (ver abajo). */
  readonly inputMode?: 'tel' | 'email';
  readonly autoComplete?: string;
};

/**
 * Un campo del formulario de proveedor.
 *
 * **El `type` es SIEMPRE `text`, tambien en el telefono y en el correo**: el esquema no valida el
 * formato de ninguno de los dos, y un `type="email"` anadiria una regla del navegador que el
 * servidor jamas aplicaria. **Sin `maxLength`**: truncaria en silencio lo pegado en vez de decir
 * que sobra; el largo lo aplica el esquema.
 */
export function SupplierField({
  name,
  label,
  required,
  defaultValue,
  error,
  inputMode,
  autoComplete,
}: SupplierFieldProps) {
  const fieldId = useId();

  return (
    <TextField
      id={`${fieldId}-${name}`}
      name={name}
      label={label}
      inputMode={inputMode}
      autoComplete={autoComplete}
      required={required}
      defaultValue={defaultValue}
      remountOnDefault
      inputClassName={`${TOUCH_TARGET} ${FIELD_TEXT}`}
      error={error}
      errorTestId={`supplier-error-${name}`}
      errorAlert={false}
      testId={`supplier-field-${name}`}
    />
  );
}
