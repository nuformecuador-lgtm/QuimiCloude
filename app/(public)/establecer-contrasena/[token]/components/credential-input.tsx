'use client';

// QC-79 T19 — El campo de contrasena de la pagina publica, con su boton de mostrar/ocultar.
//
// Vive en la ruta y no en `components/shared/` porque hoy lo usa UNA pantalla: `CredentialField`
// de QC-21 es el compuesto compartido y NO trae control de mostrar/ocultar (su R17 lo dejo fuera,
// pregunta abierta 2 de aquella ficha). Esta feature no lo reabre ni lo modifica: R25 le pide a
// ESTA pantalla un mostrar/ocultar accesible sin `:hover`, y eso se resuelve aqui. El dia que una
// segunda pantalla lo necesite, subir este archivo a `components/shared/` es moverlo de carpeta.
//
// Multiplataforma (R25, `docs/architecture.md > Componentes > Regla: multiplataforma`):
//   - `text-base md:text-base`: 16 px SIEMPRE. El primitivo `Input` trae `text-base md:text-sm`,
//     y ese `md:text-sm` (14 px) es justo lo que iOS castiga con zoom al enfocar. Se sobrescribe
//     aqui en vez de tocar el primitivo, que lo comparte todo el ERP.
//   - `h-11` (44 px) en el campo y `size-11` (44 x 44 px) en el boton: objetivos tactiles.
//   - El mostrar/ocultar es un `<button type="button">` con nombre accesible y `aria-pressed`,
//     **nunca** un `:hover`: en un movil no hay puntero que pueda pasar por encima.

import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** 16 px en el campo, tambien por encima del breakpoint `md`. Ver el encabezado. */
const CREDENTIAL_INPUT_CLASSNAME = 'h-11 text-base md:text-base';

/** 44 x 44 px exactos: `size-11` en la escala de Tailwind. */
const TOGGLE_CLASSNAME = 'size-11';

type CredentialInputProps = {
  /** Clave en el `FormData`: `credential` o `credentialConfirmation`. */
  readonly name: string;
  readonly id: string;
  readonly label: string;
  /** Texto del boton cuando la contrasena esta oculta y cuando esta visible. */
  readonly showLabel: string;
  readonly hideLabel: string;
  readonly describedBy?: string;
  readonly testId: string;
};

/**
 * Campo NO controlado (`defaultValue` ausente, sin `useState` de la candidata): la contrasena no
 * pasa por el estado de React ni por ningun atributo, y React 19 lo vacia solo cuando la Server
 * Action termina. El unico estado local es si se ve o no se ve.
 */
export function CredentialInput({
  name,
  id,
  label,
  showLabel,
  hideLabel,
  describedBy,
  testId,
}: CredentialInputProps) {
  const [visible, setVisible] = useState(false);
  const ToggleIcon = visible ? EyeOff : Eye;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          aria-describedby={describedBy}
          className={CREDENTIAL_INPUT_CLASSNAME}
          data-testid={testId}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={TOGGLE_CLASSNAME}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((anterior) => !anterior)}
          data-testid={`${testId}-toggle`}
        >
          <ToggleIcon aria-hidden="true" />
          <span className="sr-only">{visible ? hideLabel : showLabel}</span>
        </Button>
      </div>
    </div>
  );
}
