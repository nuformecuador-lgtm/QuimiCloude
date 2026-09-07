'use client';

import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Un campo de texto del formulario de pedido: etiqueta, control y error en linea (R34, R45).
 *
 * **El `type` es SIEMPRE de texto, tambien en la cantidad y en el precio, y es deliberado**
 * (R39, `design.md > 10`): el valor de un control NUMERICO de HTML pasa por el binario de coma
 * flotante, y los importes de este modulo son CADENA decimal de punta a punta. Lo que si se
 * ofrece es el teclado adecuado en movil, que es presentacion y no validacion: `inputMode`.
 * (El atributo vetado no se escribe ni en este comentario: la guardia de fuente de la ruta lo
 * busca y no debe encontrar un falso positivo.)
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
  /** Teclado del movil. NO cambia el `type`, que es siempre `text`. */
  readonly inputMode?: 'decimal';
};

export function OrderField({
  name,
  label,
  defaultValue,
  required,
  error,
  inputMode,
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
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        required={required}
        defaultValue={defaultValue}
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
