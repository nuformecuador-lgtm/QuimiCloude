'use client';

import { useId } from 'react';

import { TextField } from '@/components/shared/text-field';
import { formatDecimalDisplay } from '@/lib/shared/ui/decimal-display';

/**
 * Un campo de texto del formulario de pedido: etiqueta, control y error en linea (R34, R45).
 *
 * **Al soltar el foco, el valor se redondea a `roundDecimals`** si esa prop esta presente -la
 * CANTIDAD la usa con 2, decision humana de 2026-09-09-. El redondeo coloca el valor donde la
 * pantalla lo muestra; lo que se ENVIA sigue siendo el `FormData`, con el valor ya colocado.
 * Quitar los ceros finales (y el punto cuando no queda nada) hace que «25.0» y «25.00» se
 * muestren como «25», y que «25.3» y «25.08» conserven sus decimales.
 *
 * **Quien redondea es `formatDecimalDisplay` de `lib/shared/ui/decimal-display`** (2026-09-17).
 * Antes lo hacia un `roundDecimalText` propio de este archivo, y ese tenia DOS fallos que el
 * campo mostraba: «25.00» volvia tal cual en vez de quedar en «25» -justo lo que el parrafo de
 * arriba dice que hace-, y cualquier valor que redondeara a un entero salia con el punto suelto
 * («25.001» -> «25.»). Un `type="number"` sanea «25.» a cadena VACIA, asi que el campo se
 * quedaba en blanco al tabular. La regla de redondeo vive ahora en un solo sitio, con el mismo
 * criterio que usan las tablas para pintar, y no hay dos que puedan separarse.
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
 * servidor. `min` SI se declara -es del navegador, no una copia de la regex- para que el control
 * numerico no ofrezca negativos ni cero; la validacion real sigue siendo la del esquema.
 */

/**
 * Redondea UN DECIMAL TEXTO a `decimals` lugares y afeita los ceros finales: «25.0», «25.00» y
 * «25.08» a 2 decimales quedan «25», «25» y «25.08». La entrada invalida y la vacia vuelven tal
 * cual -el campo no es la frontera de validacion, el esquema del contrato lo es-, y un valor sin
 * decimales (o con menos de los pedidos) no se toca.
 *
 * Es el helper compartido con un `trim()` delante: el valor de un control puede traer espacios y
 * `formatDecimalDisplay` no los quita a proposito -el resto de sus llamadores le pasan cadenas
 * del contrato, que no los tienen-.
 */
function roundDecimalText(raw: string, decimals: number): string {
  return formatDecimalDisplay(raw.trim(), decimals);
}

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
   * Minimo del control numerico. El navegador lo usa para no ofrecer negativos ni cero, pero
   * quien valida sigue siendo el esquema del contrato: un valor tecleado a mano igual pasa por
   * `createOrderSchema`/`updateOrderSchema` al enviar. Se ignora con `type` de texto.
   */
  readonly min?: string;
  /**
   * Avisa de lo tecleado. El campo SIGUE SIN ESTAR CONTROLADO -no se le pasa `value`-: esto es un
   * espia para quien necesite reflejar el valor en otro sitio, como el titulo del panel.
   */
  readonly onValueChange?: (value: string) => void;
  /**
   * Decimales a los que se redondea al soltar el foco. El valor se coloca en el campo y se avisa
   * con `onValueChange`. Afeita los ceros finales y, cuando no queda ninguno, el punto decimal:
   * «25.00» y «25.0» se muestran como «25», «25.3» y «25.08» conservan sus decimales. Ausente,
   * el campo no redondea nada.
   */
  readonly roundDecimals?: number;
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
  min,
  onValueChange,
  roundDecimals,
}: OrderFieldProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-${name}`;

  return (
    <TextField
      id={inputId}
      name={name}
      label={label}
      type={type}
      step={type === 'number' ? step : undefined}
      min={type === 'number' ? min : undefined}
      inputMode={inputMode}
      autoComplete="off"
      required={required}
      defaultValue={defaultValue}
      remountOnDefault
      onValueChange={onValueChange}
      onBlur={
        roundDecimals === undefined
          ? undefined
          : (event) => {
              const rounded = roundDecimalText(event.currentTarget.value ?? '', roundDecimals);
              if (rounded === event.currentTarget.value) return;
              event.currentTarget.value = rounded;
              onValueChange?.(rounded);
            }
      }
      error={error}
      testId={`order-field-${name}`}
      errorTestId={`order-error-${name}`}
      errorAlert={false}
    />
  );
}
