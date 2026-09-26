import { requirePermission, type Actor } from './actor';
import { SupplierNotFoundError, ValidationError } from './errors';
import type { SupplierScope } from './supplier-scope';

import type { SupplierCatalogImportRepository } from '../ports/supplier-catalog-import-repository';

import { z } from 'zod';

export type FindCatalogLinesByIdentityDeps = {
  readonly catalog: SupplierCatalogImportRepository;
};

/** Una clave de identidad de linea: nombre normalizado y presentacion. */
const identityKeySchema = z.strictObject({
  nameNormalized: z.string().min(1),
  presentationId: z.string().uuid(),
});

const findByIdentityInputSchema = z.strictObject({
  supplierId: z.string().uuid(),
  keys: z.array(identityKeySchema),
});

export type AliveCatalogLineByIdentity = {
  readonly id: string;
  readonly nameNormalized: string;
  readonly presentationId: string;
  readonly cost: string;
};

/**
 * Lectura para MOSTRAR el costo actual de una fila que va a clasificar como «cambia». NO es
 * la comprobacion previa que el puerto viejo del catalogo prohibe: la escritura de
 * `createImportCatalogLines` no depende de este resultado.
 *
 * Permiso `proveedores.modificar` como PRIMERA operacion, antes de tocar el puerto.
 */
export function createFindCatalogLinesByIdentity(
  deps: FindCatalogLinesByIdentityDeps,
): (
  input: unknown,
  actor: Actor | null | undefined,
) => Promise<readonly AliveCatalogLineByIdentity[]> {
  return async function findCatalogLinesByIdentity(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<readonly AliveCatalogLineByIdentity[]> {
    requirePermission(actor, 'proveedores.modificar');

    const parsed = findByIdentityInputSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const scope: SupplierScope = { companyId: actor.companyId };

    const result = await deps.catalog.findAliveByIdentities(
      parsed.data.supplierId,
      parsed.data.keys,
      scope,
    );
    if (result === 'supplier_not_found') throw new SupplierNotFoundError();

    return result.lines;
  };
}
