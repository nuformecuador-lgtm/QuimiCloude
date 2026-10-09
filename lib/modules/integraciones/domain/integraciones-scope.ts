import type { Actor } from './actor';

/** La empresa de toda lectura y escritura de una conexión. Sale del actor, nunca de la entrada. */
export type IntegracionesScope = { readonly companyId: string };

export function scopeOf(actor: Actor): IntegracionesScope {
  return { companyId: actor.companyId };
}
