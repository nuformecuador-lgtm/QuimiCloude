import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { showcaseQuerySchema } from './supplier-showcase';
import type { SupplierScope } from './supplier-scope';

import type { ShowcasePage } from './supplier-showcase';

import type { SupplierRepository } from '../ports/supplier-repository';

export type ListSupplierShowcaseDeps = {
  readonly suppliers: SupplierRepository;
};

/**
 * Tanda de proveedores de la vista de catalogo visual (`design.md > 2.3`).
 *
 * Mismo orden que el resto del modulo: `requirePermission` primero, despues zod, despues el
 * puerto con `scope` construido a partir del actor (R4). El tamano de tanda y el orden son
 * constantes del dominio, no entrada: el puerto los aplica solo, esta funcion no los pasa.
 */
export function createListSupplierShowcase(
  deps: ListSupplierShowcaseDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<ShowcasePage> {
  return async function listSupplierShowcase(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<ShowcasePage> {
    requirePermission(actor, 'proveedores.consultar');

    const scope: SupplierScope = { companyId: actor.companyId };

    const parsed = showcaseQuerySchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    return deps.suppliers.listShowcaseAlive(parsed.data, scope);
  };
}
