import { z } from 'zod';

import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { productNameSchema } from './product-input';
import { PRODUCT_TYPES } from './product-type';

import type { NewProduct } from './product-view';
import type { ProductRepository } from '../ports/product-repository';

export type CreateRawMaterialDeps = {
  readonly products: Pick<ProductRepository, 'create'>;
  /** Inyectable para que los tests fijen el instante sin tocar el reloj global. */
  readonly now?: () => Date;
};

/** Sin `type`, sin lote: es SIEMPRE una materia prima (`PRODUCT`), con el nombre leido de la
 *  revision de la formula. */
const createRawMaterialSchema = z.strictObject({ name: productNameSchema });

/**
 * Alta de MATERIA PRIMA desde la revision de una formula (QC-159 `design.md > 5.3`, P1):
 * excepcion, acotada a esta revision, a la decision de QC-90 de que el alta SIEMPRE crea lote.
 * El producto nace de tipo `PRODUCT`, SIN lote, sin unidad y con existencia 0 -por el
 * `DEFAULT` de la columna, no porque este caso de uso la escriba-, usando `products.create`,
 * el metodo del puerto que ya existe y hasta ahora no tenia llamantes. El alta manual de
 * inventario (`createCreateProduct`) sigue creando siempre su lote: este caso de uso no la
 * toca.
 *
 * `requirePermission(actor, 'inventario.modificar')` es la PRIMERA linea, antes de zod y antes
 * de tocar el puerto: quien no puede crear materia prima no dispara ninguna consulta.
 */
export function createCreateRawMaterial(
  deps: CreateRawMaterialDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<{ id: string }> {
  const now = deps.now ?? (() => new Date());

  return async function createRawMaterial(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<{ id: string }> {
    requirePermission(actor, 'inventario.modificar');

    const parsed = createRawMaterialSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();

    const producto: NewProduct = {
      name: parsed.data.name,
      type: PRODUCT_TYPES.PRODUCT,
      qtyAlert: null,
    };

    return deps.products.create(producto, now(), { companyId: actor.companyId });
  };
}
