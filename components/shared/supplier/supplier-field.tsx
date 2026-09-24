'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Area tactil minima de R48 (44x44 px). Los primitivos miden 32 px de alto por defecto. */
const TOUCH_TARGET = 'min-h-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R48 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

type SupplierFieldProps = {
  /** Nombre del campo en el `FormData`. De el salen tambien los `data-testid`. */
  readonly name: string;
  /** Etiqueta visible. */
  readonly label: string;
  /** Validacion del navegador. El servidor revalida igual: el cliente nunca es la frontera. */
  readonly required?: boolean;
  readonly defaultValue: string;
  /** Mensaje de error del campo (R32). Se pinta en linea y marca el input como invalido. */
  readonly error?: string;
  /** Teclado del movil. NO cambia el `type`, que es siempre `text` (ver abajo). */
  readonly inputMode?: 'tel' | 'email';
  /** Autocompletado del navegador. Es una ayuda, no una regla de validacion. */
  readonly autoComplete?: string;
};

/**
 * Un campo del formulario de proveedor: etiqueta, control y error en linea (R32, R48).
 *
 * **El `type` es SIEMPRE `text`, tambien en el telefono y en el correo, y es deliberado**: el
 * esquema del contrato publico (`supplier-input.ts`) declara expresamente que no hay validacion
 * de formato en ninguno de los dos —«un proveedor quimico da un correo comercial que no tiene
 * por que parecerse a nada»—. Un `type="email"` anadiria una regla del navegador que el dominio
 * no tiene, y el usuario veria un rechazo que el servidor jamas habria hecho. Lo que si se
 * ofrece es el teclado adecuado en movil, que es presentacion y no validacion: `inputMode`.
 *
 * **Tampoco se declara `maxLength`** por la misma razon: los largos maximos son del esquema
 * (`SUPPLIER_NAME_MAX_LENGTH` y companeros) y quien los aplica es el, en el cliente y en el
 * servidor. Un `maxLength` truncaria en silencio lo pegado en vez de decir que sobra.
 *
 * **`key={defaultValue}`** por lo mismo que en `product-field.tsx` de QC-22: Base UI avisa
 * cuando el `defaultValue` de un campo no controlado cambia despues de montarse, y la clave
 * fuerza un remontaje justo en ese salto. El campo sigue sin estar controlado.
 *
 * **Fuente de 16 px y alto de 44 px en todos los anchos** (R48): por debajo de 16 px Safari en
 * iOS hace zoom sobre el campo al enfocarlo, y el usuario acaba con la pantalla desencuadrada.
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
  const inputId = `${fieldId}-${name}`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>

      <Input
        key={defaultValue}
        id={inputId}
        name={name}
        type="text"
        inputMode={inputMode}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={`supplier-field-${name}`}
      />

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`supplier-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}
