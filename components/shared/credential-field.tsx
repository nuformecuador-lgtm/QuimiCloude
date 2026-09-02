'use client';

// components/shared/credential-field.tsx
//
// El campo que compone el input y la lista de requisitos, y avisa al formulario consumidor
// si las seis reglas comprobables en vivo se cumplen (`design.md > 3.3`).
//
// La candidata vive en un `useState` interno, alimentado por el `onChange` del propio input
// (`design.md > 9(e)`): el consumidor nunca la ve, solo recibe el booleano derivado por
// `onOwnRulesMetChange`. El input conserva su `name`, asi que un `<form action>` lo envia como
// cualquier campo no controlado por el consumidor.
//
// Sin boton de envio (`design.md > 9(d)`): el componente informa, el formulario decide. Sin
// control de mostrar/ocultar (R17, pregunta abierta 2 de `requirements.md`).

import { useEffect, useId, useState } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { evaluateCredentialRules, type CredentialRule } from '@/lib/modules/identity';

import { CredentialRequirements, type CredentialRuleState } from './credential-requirements';

type CredentialFieldProps = {
  /** Clave en el `FormData`; la elige el consumidor. */
  readonly name: string;
  readonly label: string;
  readonly id?: string;
  readonly autoComplete?: 'new-password';
  /** Veredicto del servidor sobre la septima. Por defecto: `'unknown'` (R7, R8). */
  readonly breachedState?: CredentialRuleState;
  readonly labels?: Partial<Record<CredentialRule, string>>;
  /** Se invoca al montar y cada vez que cambia si las SEIS se cumplen (R10). */
  readonly onOwnRulesMetChange?: (met: boolean) => void;
};

export function CredentialField({
  name,
  label,
  id,
  autoComplete,
  breachedState,
  labels,
  onOwnRulesMetChange,
}: CredentialFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const requirementsId = `${inputId}-requirements`;

  const [candidate, setCandidate] = useState('');

  const ownRulesMet = evaluateCredentialRules(candidate).ok;

  // Dependencia en el BOOLEANO derivado, no en la candidata ni en `onOwnRulesMetChange`
  // (R10, `design.md > 3.3`): se dispara al montar (con `false`, campo vacio) y solo cuando
  // el veredicto cambia, nunca en cada pulsacion ni por una nueva identidad de la funcion.
  useEffect(() => {
    onOwnRulesMetChange?.(ownRulesMet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownRulesMet]);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        name={name}
        type="password"
        autoComplete={autoComplete}
        aria-describedby={requirementsId}
        value={candidate}
        onChange={(event) => setCandidate(event.target.value)}
      />
      <CredentialRequirements
        id={requirementsId}
        candidate={candidate}
        breachedState={breachedState}
        labels={labels}
      />
    </div>
  );
}
