'use client';

// components/shared/credential-requirements.tsx
//
// Lista presentacional pura de los requisitos de una credencial nueva (`design.md > 3.2`).
// No declara ninguna regla: pinta el catalogo `CREDENTIAL_RULES` que exporta el dominio
// `identity` (QC-19) y deriva el estado de las seis comprobables sin red con
// `evaluateCredentialRules`, que es pura y sincrona (R1, R2, R3, R4, R6).
//
// La septima ("breached") no se resuelve aqui: llega por el prop `breachedState`, en estado
// neutro por defecto (R7, R8, R9). El componente no hace ninguna peticion, no guarda estado
// propio y no escribe la candidata en ningun atributo ni texto (R21).

import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';

import { CREDENTIAL_RULES, evaluateCredentialRules, type CredentialRule } from '@/lib/modules/identity';

import { CREDENTIAL_RULE_LABELS } from './credential-rule-labels';

/**
 * Estado de una regla en la interfaz. Vive en la UI, no en el dominio (`design.md > 3.1`):
 * `'unknown'` es el estado neutro de la septima mientras el servidor no se ha pronunciado, y
 * QC-19 no tiene concepto de "pendiente de comprobar".
 */
export type CredentialRuleState = 'met' | 'unmet' | 'unknown';

const STATE_ICON: Readonly<Record<CredentialRuleState, typeof CheckCircle2>> = {
  met: CheckCircle2,
  unmet: XCircle,
  unknown: CircleDashed,
};

/** Texto de estado accesible por entrada (R16): el canal no puede ser solo color o icono. */
const STATE_TEXT: Readonly<Record<CredentialRuleState, string>> = {
  met: 'Requisito cumplido',
  unmet: 'Requisito incumplido',
  unknown: 'Requisito pendiente de comprobar',
};

type CredentialRequirementsProps = {
  /** El texto escrito hasta ahora. Se usa solo como argumento de una funcion pura (R21). */
  readonly candidate: string;
  /** Veredicto del servidor sobre la septima. Por defecto: `'unknown'` (R7, R8). */
  readonly breachedState?: CredentialRuleState;
  /** Sustituye entera o parcialmente el copy de `CREDENTIAL_RULE_LABELS` (R15). */
  readonly labels?: Partial<Record<CredentialRule, string>>;
  readonly id?: string;
};

function deriveState(
  rule: CredentialRule,
  unmet: readonly CredentialRule[],
  breachedState: CredentialRuleState,
): CredentialRuleState {
  if (rule === 'breached') return breachedState;
  return unmet.includes(rule) ? 'unmet' : 'met';
}

/**
 * La lista de los siete requisitos, siempre visible (R5) y sin ningun control interactivo
 * nuevo. Sin `useState`, sin `useEffect`, sin `fetch`, sin puntuacion de fuerza (R20).
 */
export function CredentialRequirements({
  candidate,
  breachedState = 'unknown',
  labels,
  id,
}: CredentialRequirementsProps) {
  const { unmet } = evaluateCredentialRules(candidate);

  return (
    <ul id={id} className="flex flex-col gap-1">
      {CREDENTIAL_RULES.map((rule) => {
        const state = deriveState(rule, unmet, breachedState);
        const label = labels?.[rule] ?? CREDENTIAL_RULE_LABELS[rule];
        const StatusIcon = STATE_ICON[state];

        return (
          <li
            key={rule}
            data-rule={rule}
            data-state={state}
            className="flex items-center gap-2 text-sm text-muted-foreground data-[state=met]:text-foreground"
          >
            <StatusIcon aria-hidden="true" className="size-4 shrink-0" />
            <span>{label}</span>
            <span className="sr-only">{STATE_TEXT[state]}</span>
          </li>
        );
      })}
    </ul>
  );
}
