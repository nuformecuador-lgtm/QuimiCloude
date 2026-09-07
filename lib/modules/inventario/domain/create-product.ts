import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { createProductSchema } from './product-input';

import type { ProductRepository } from '../ports/product-repository';

export type CreateProductDeps = {
  readonly products: ProductRepository;
  /**
   * El spec (`design.md > 7`) exige que el puerto reciba un `now: Date`, pero no dice de
   * donde sale ese instante -no es una entrada del actor, ni algo que el borde valide-.
   * Se resuelve como dependencia INYECTABLE, con `() => new Date()` por defecto, para que
   * el test de servicio pueda fijar el instante sin tocar el reloj global. No se lee
   * `next/headers` ni ninguna sesion aqui: eso violaria R1.
   */
  readonly now?: () => Date;
};

/**
 * Alta de producto (R5, R6, R9, R10, R11, R12). `requirePermission(actor, 'inventario.modificar')` es la PRIMERA linea,
 * antes de zod y antes de tocar el puerto (R2, R3): un actor sin permiso ni siquiera
 * dispara la validacion.
 */
export function createCreateProduct(
  deps: CreateProductDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createProduct(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    // R6: al crear, el actor queda registrado como autor de creacion Y de modificacion.
    // El puerto solo recibe un `actorId`; es su adaptador (T9) el que lo escribe en las
    // dos columnas `created_by`/`updated_by` (design.md > 2.1).
    return deps.products.create(parsed.data, actor.id, now());
  };
}
