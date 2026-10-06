'use client';

import { CircleAlertIcon } from 'lucide-react';
import { useId, type ChangeEventHandler, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const TOUCH_TARGET = 'min-h-11 min-w-11';

/** 16 px en TODOS los anchos: el primitivo baja a 14 px en `md` y R31 no distingue por ancho. */
const FIELD_TEXT = 'text-base md:text-base';

type ProductFieldProps = {
  /** Nombre del campo en el `FormData`. De el salen tambien los `data-testid`. */
  readonly name: string;
  /** Etiqueta visible. Es tambien la que nombra al disparador de la ayuda. */
  readonly label: string;
  /** Tipo del `<input>`. `number` es el unico que ademas fija `inputMode`, `min` y `step`. */
  readonly type: 'text' | 'number' | 'date';
  /** Validacion del navegador. El servidor revalida igual: el cliente nunca es la frontera. */
  readonly required?: boolean;
  /**
   * Ayuda del campo. Si viene, la etiqueta gana un icono de admiracion y lo que se pase aqui
   * es lo que sale en el tooltip al pasar por encima o al enfocarlo con el teclado. Si no
   * viene, no se pinta ningun icono: un campo que se explica solo no lleva adorno.
   */
  readonly helper?: ReactNode;
  /** Valor inicial del campo sin controlar. No se pasa junto con `value`. */
  readonly defaultValue?: string;
  /** Mensaje de error del campo (R20). Se pinta en linea y marca el input como invalido. */
  readonly error?: string;
  /** Solo para `text`: teclado decimal, o numerico para enteros, en movil sin `type="number"`. */
  readonly inputMode?: 'decimal' | 'numeric';
  /** Pasa el campo a controlado. Lo usan los dos importes del lote y nadie mas. */
  readonly value?: string;
  /** Acompana a `value`: sin el, el campo controlado seria de solo lectura. */
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
};

/**
 * Un campo del formulario de producto: etiqueta, ayuda opcional, control y error en linea.
 *
 * **Un solo componente para los dos tipos** que la pantalla usa. Antes habia dos casi
 * identicos -`TextField` e `IntegerField`- dentro de `product-form.tsx`, y la diferencia
 * entre ellos era el `type` y tres atributos que se derivan de el.
 *
 * **`type="number"` NO vale para el costo** y por eso el tipo es una prop y no una deduccion:
 * un `number` de HTML pasa por el binario de coma flotante, y el importe viaja como cadena
 * decimal a proposito desde el dominio. Quien necesite teclado numerico sin `type="number"`
 * pasa `inputMode`.
 *
 * **La ayuda es un boton de verdad** (`type="button"`), no un `<span title>`: dentro de un
 * `<form>` un boton sin tipo lo enviaria -y desde que el panel entero es el formulario, eso
 * incluye a este-. Al ser un boton se alcanza con el teclado, y el tooltip de Base UI se abre
 * tambien al enfocarlo, no solo al pasar el raton por encima.
 *
 * **`key={defaultValue}`** por la misma razon que en `login-form.tsx`: Base UI avisa cuando el
 * `defaultValue` de un campo no controlado cambia despues de montarse, y la clave fuerza un
 * remontaje justo en ese salto. El campo sigue sin estar controlado.
 *
 * **Salvo que se le pase `value`**: entonces el campo pasa a controlado y no lleva ni
 * `defaultValue` ni `key`. Es una salida acotada para los dos importes del lote, que se filtran y
 * se rellenan el uno al otro mientras se teclean; los otros siete campos siguen sin controlar.
 */
export function ProductField({
  name,
  label,
  type,
  required,
  helper,
  defaultValue,
  error,
  inputMode,
  value,
  onChange,
}: ProductFieldProps) {
  const fieldId = useId();
  const inputId = `${fieldId}-${name}`;
  const errorId = `${inputId}-error`;

  const isNumber = type === 'number';
  // Base UI elige entre controlado y sin controlar segun `value` sea `undefined`, asi que las dos
  // ramas no pueden convivir. La `key` de remontaje sobra igual: sirve justo para lo contrario.
  const isControlled = value !== undefined;

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
                  // 44x44 DE VERDAD, no `size-6`: `docs/architecture.md > Componentes > Regla:
                  // multiplataforma` exige ese objetivo tactil minimo. Este disparador es gemelo
                  // del de `PresentationSelect` y vive en el MISMO panel, asi que sube con el
                  // -dos iconos de ayuda contiguos con tamanos distintos serian peor que ninguno-.
                  // Crece el blanco de toque; el icono dibujado sigue en `size-4` y queda centrado,
                  // pegado a la etiqueta dentro del `flex items-center gap-1.5` del padre.
                  // `shrink-0` impide que el flex le recorte los 44 px de ancho.
                  className={`flex ${TOUCH_TARGET} shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                  data-testid={`product-helper-${name}`}
                />
              }
            >
              <CircleAlertIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent data-testid={`product-helper-text-${name}`}>{helper}</TooltipContent>
          </Tooltip>
        )}
      </div>

      <Input
        key={isControlled ? undefined : defaultValue}
        id={inputId}
        name={name}
        type={type}
        inputMode={isNumber ? 'numeric' : inputMode}
        step={isNumber ? 1 : undefined}
        min={isNumber ? 0 : undefined}
        required={required}
        defaultValue={isControlled ? undefined : defaultValue}
        value={value}
        onChange={onChange}
        className={`${TOUCH_TARGET} ${FIELD_TEXT}`}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : errorId}
        data-testid={`product-field-${name}`}
      />

      {error === undefined ? null : (
        <p id={errorId} className="text-sm text-destructive" data-testid={`product-error-${name}`}>
          {error}
        </p>
      )}
    </div>
  );
}