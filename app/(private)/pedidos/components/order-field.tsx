'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Un campo de texto del formulario de pedido: etiqueta, control y error en linea (R34, R45).
 *
 * **El `type` es de texto POR DEFECTO** (R39, `design.md > 10`): los importes de este modulo son
 * CADENA decimal de punta a punta, y el teclado adecuado en movil se ofrece con `inputMode`, que
 * es presentacion y no validacion.
 *
 * **ENMIENDA DEL 2026-09-08 (decision humana): la CANTIDAD se captura con el control numerico**
 * del navegador, y por eso el `type` es ahora una prop en vez de una constante. Lo que R39
 * protegia sigue en pie donde importa: el valor viaja igual como CADENA en el `FormData` -un
 * `input` no devuelve un `number`- y quien lo valida sigue siendo el esquema del contrato, en el
 * cliente y en el servidor. Lo que se pierde es el control sobre lo que el navegador admite
 * teclear; lo que se gana son los pasos y el teclado numerico nativos, que es lo que se pidio.
 *
 * **No se declara `pattern` ni `maxLength`**: el patron decimal, el «mayor que cero» de la
 * cantidad y el cero admitido en el precio son del esquema del contrato publico, y ese esquema no
 * exporta su expresion regular. Escribirla aqui seria la segunda copia de la regla que R33
 * prohibe. Quien valida es `createOrderSchema`/`updateOrderSchema`, en el cliente y en el
 * servidor.
 *
 * **`key={defaultValue}`** por lo mismo que en `supplier-field.tsx` y `product-field.tsx`: Base UI
 * avisa cuando el `defaultValue` de un campo no controlado cambia despues de montarse, y la clave
 * fuerza un remontaje justo en ese salto. El campo sigue sin estar controlado.
 *
 * **Fuente de 16 px y alto de 44 px en todos los anchos** (R45): por debajo de 16 px Safari en
 * iOS hace zoom sobre el campo al enfocarlo y el usuario acaba con la pantalla desencuadrada.
 */

/** Objetivo tactil minimo (44x44 px) de R45. */
const TOUCH_TARGET = 'min-h-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R45 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

export type OrderFieldProps = {
  /** Nombre del campo en el `FormData`. De el salen tambien los `data-testid`. */
  readonly name: string;
  /** Etiqueta visible. */
  readonly label: string;
  readonly defaultValue: string;
  /** Validacion del navegador. El servidor revalida igual: el cliente nunca es la frontera. */
  readonly required?: boolean;
  /** Mensaje de error del campo (R34). Se pinta en linea y marca el control como invalido. */
  readonly error?: string;
  /** Teclado del movil. Independiente del `type`. */
  readonly inputMode?: 'decimal';
  /** Control del navegador. `text` salvo que se pida explicitamente el numerico. */
  readonly type?: 'text' | 'number';
  /**
   * Paso del control numerico. `any` para no obligar a enteros: la cantidad es decimal. Se ignora
   * con `type` de texto.
   */
  readonly step?: string;
  /**
   * Avisa de lo tecleado. El campo SIGUE SIN ESTAR CONTROLADO -no se le pasa `value`-: esto es un
   * espia para quien necesite reflejar el valor en otro sitio, como el titulo del panel.
   */
  readonly onValueChange?: (value: string) => void;
};

export function OrderField({
  name,
  label,
  defaultValue,
  required,
  error,
  inputMode,
  type = 'text',
  step,
  onValueChange,
}: OrderFieldProps) {
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
        type={type}
        step={type === 'number' ? step : undefined}
        inputMode={inputMode}
        autoComplete="off"
        required={required}
        defaultValue={defaultValue}
        onChange={
          onValueChange === undefined
            ? undefined
            : (event) => onValueChange(event.currentTarget.value)
        }
        className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={`order-field-${name}`}
      />

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`order-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}
