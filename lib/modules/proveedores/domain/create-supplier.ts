import { requirePermission, type Actor } from './actor';
import { SupplierDuplicateNameError, ValidationError } from './errors';
import type { SupplierScope } from './supplier-scope';
import { createSupplierSchema } from './supplier-input';
import { normalizeSupplierName } from './supplier-name';

import type { SupplierRepository } from '../ports/supplier-repository';

export type CreateSupplierDeps = {
  readonly suppliers: SupplierRepository;
  /**
   * El puerto recibe un `now: Date` (`design.md > 7`) y ese instante no es una entrada del
   * actor ni algo que el borde valide: se resuelve como dependencia INYECTABLE, con
   * `() => new Date()` por defecto, para que el test pueda fijarlo sin tocar el reloj
   * global. Aqui NO se lee `next/headers` ni ninguna sesion: eso violaria R1.
   */
  readonly now?: () => Date;
};

/**
 * Alta de proveedor (R7, R8, R15, R16, R41).
 *
 * `requirePermission(actor, 'proveedores.modificar')` es la PRIMERA linea, antes de `zod` y
 * antes de tocar el puerto (R12): un actor sin permiso ni siquiera dispara la validacion, y
 * el test de autorizacion lo demuestra con dobles que fallan si los llaman.
 */
export function createCreateSupplier(
  deps: CreateSupplierDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createSupplier(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'proveedores.modificar');

    // La empresa sale del ACTOR y jamas de la entrada: nadie puede elegir dar de alta en
    // nombre de otra.
    const scope: SupplierScope = { companyId: actor.companyId };

    const parsed = createSupplierSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R16: el nombre y su forma normalizada se escriben JUNTOS, y quien los empareja es
    // este caso de uso -no el adaptador-, para que el emparejamiento sea observable con un
    // doble del puerto.
    //
    // R8: al crear, el actor queda como autor de creacion Y de modificacion. El puerto solo
    // recibe un actorId; escribirlo en las dos columnas es del adaptador (T11).
    const result = await deps.suppliers.create(
      { ...parsed.data, nameNormalized: normalizeSupplierName(parsed.data.name) },
      actor.id,
      now(),
      scope,
    );

    // R15: el duplicado llega como resultado discriminado del puerto -lo tradujo el
    // adaptador desde el 23505 del indice unico parcial-, nunca como excepcion de Prisma.
    if (result === 'duplicate') throw new SupplierDuplicateNameError();

    return result;
  };
}
