// QC-19 — La politica de credenciales, en el dominio de `identity` (R16).
//
// Partida en dos a proposito (`design.md > 2.1`):
//   - `evaluateCredentialRules`: longitud y composicion. PURA y SINCRONA (R13).
//   - `createCredentialPolicy`: lo anterior mas la lista de filtradas, por puerto (R7, R14).
//
// Los nombres dicen `credential` y nunca `password`: `guard-password-never-plaintext`
// marca en rojo todo identificador declarado que nombre la contrasena y no acabe en
// `hash`. Se adaptan los nombres, no se relaja la guardia (`design.md > 6`).

// El unico import de valor es la constante de maximo ya vigente en el repo: `max_length`
// la REUTILIZA, no declara un maximo nuevo (R11). El del puerto es `import type`, se borra
// al compilar y no arrastra nada a quien importe este archivo desde el cliente.
import type { BreachedCredentialList } from '../ports/breached-credential-list';

import { CREDENTIAL_MAX_LENGTH } from './credentials';

/** Minimo de caracteres de una credencial nueva (R2). */
export const CREDENTIAL_MIN_LENGTH = 8;

/**
 * Catalogo completo y estable de reglas (R23). Los codigos son independientes del idioma:
 * el mensaje que ve una persona lo compone la UI (QC-21) a partir del codigo.
 *
 * El ORDEN de esta lista es el orden en que se devuelven las reglas incumplidas (R8).
 */
export const CREDENTIAL_RULES = [
  'min_length',
  'max_length',
  'no_uppercase',
  'no_lowercase',
  'no_digit',
  'no_symbol',
  'breached',
] as const;

export type CredentialRule = (typeof CREDENTIAL_RULES)[number];

export type CredentialPolicyResult = {
  readonly ok: boolean;
  readonly unmet: readonly CredentialRule[];
};

/**
 * Las reglas que se comprueban con codigo propio, por categoria Unicode y no por lista
 * ASCII cerrada (`design.md > 3`): asi `Ñ` cuenta como mayuscula y `ñ` como minuscula.
 * Simbolo es todo lo que no sea letra ni numero, el espacio incluido (R6).
 *
 * La candidata NO se recorta ni se normaliza: se evalua tal cual llega (R10).
 */
const OWN_RULE_CHECKS: Readonly<
  Record<Exclude<CredentialRule, 'breached'>, (candidate: string) => boolean>
> = {
  min_length: (candidate) => candidate.length >= CREDENTIAL_MIN_LENGTH,
  max_length: (candidate) => candidate.length <= CREDENTIAL_MAX_LENGTH,
  no_uppercase: (candidate) => /\p{Lu}/u.test(candidate),
  no_lowercase: (candidate) => /\p{Ll}/u.test(candidate),
  no_digit: (candidate) => /\p{Nd}/u.test(candidate),
  no_symbol: (candidate) => /[^\p{L}\p{N}]/u.test(candidate),
};

/**
 * Longitud y composicion, sin red, sin base y sin puerto alguno (R13). Devuelve TODAS las
 * reglas incumplidas, recorriendo `CREDENTIAL_RULES` en su orden declarado (R8), y el
 * resultado depende solo de la candidata: sin reloj, sin azar, sin estado (R12).
 *
 * `unmet` contiene codigos del catalogo, nunca la candidata ni un fragmento suyo (R24).
 */
export function evaluateCredentialRules(candidate: string): CredentialPolicyResult {
  const unmet: CredentialRule[] = [];
  for (const rule of CREDENTIAL_RULES) {
    if (rule === 'breached') continue;
    if (!OWN_RULE_CHECKS[rule](candidate)) unmet.push(rule);
  }
  return { ok: unmet.length === 0, unmet };
}

/**
 * La politica completa: las reglas propias mas la lista de filtradas, que llega por el
 * puerto `BreachedCredentialList` (R14). No reimplementa ninguna regla.
 *
 * La comparacion en minusculas vive AQUI y no en el adaptador (`design.md > 4`): el puerto
 * documenta que la comparacion es insensible a mayusculas, y hacerlo en el dominio deja esa
 * garantia demostrada con un doble del puerto en vez de depender de cada implementacion.
 */
export function createCredentialPolicy(deps: {
  readonly breached: BreachedCredentialList;
}): (candidate: string) => Promise<CredentialPolicyResult> {
  return async (candidate: string): Promise<CredentialPolicyResult> => {
    const own = evaluateCredentialRules(candidate);

    let listed: boolean;
    try {
      listed = await deps.breached.includes(candidate.toLowerCase());
    } catch (cause) {
      // Fail-loud, no fail-open (R15): tragar el fallo y devolver "aceptable" convertiria
      // R7 en decorado el dia que se rompa. El mensaje dice QUE operacion fallo y no
      // incluye la candidata ni un fragmento suyo (R24).
      throw new Error('fallo la consulta de la lista de credenciales filtradas', { cause });
    }

    if (!listed) return own;

    // Orden estable (R8): se reensambla recorriendo el catalogo, no anadiendo al final.
    const unmet = CREDENTIAL_RULES.filter(
      (rule) => rule === 'breached' || own.unmet.includes(rule),
    );
    return { ok: false, unmet };
  };
}
