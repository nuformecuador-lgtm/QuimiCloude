import { z } from 'zod';

const customerIdSchema = z.string().uuid();

/**
 * `true` si `id` tiene forma de uuid. Un identificador sin esa forma no puede existir en la
 * base, asi que se rechaza antes de llegar al puerto, con el mismo error que un id inexistente.
 */
export function isCustomerId(id: string): boolean {
  return customerIdSchema.safeParse(id).success;
}
