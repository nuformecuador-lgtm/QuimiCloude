import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { quoteOrderCostSchema } from './order-input';
import { packagingLinesOfInput } from './resolve-distribution';
import { resolveOrderCost } from './resolve-ingredients-cost';

import type { PackagingCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

/**
 * Solo los catalogos de LECTURA que `resolveOrderCost` necesita: sin `orders` ni
 * `presentations`, asi que este caso de uso no puede escribir ninguna fila porque no recibe
 * nada que escriba.
 */
export type QuoteOrderCostDeps = {
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  readonly packaging: PackagingCatalog;
};

export type OrderCostQuote = { readonly ingredientsCost: string | null };

/**
 * Cotizacion de solo lectura del importe de un pedido -ingredientes y envases del reparto-: la
 * misma regla que el alta y la edicion aplican al guardar (`resolveOrderCost`), con el
 * `companyId` que llega SIEMPRE del actor de la sesion, nunca de la entrada.
 *
 * `data.orderId` solo lo envia el formulario de EDICION: hace que lo que ese pedido ya tiene
 * apartado cuente como disponible para el mismo, igual que hace `updateOrder` al guardar. No
 * abre ninguna lectura del pedido: es una cadena opaca que solo usa `findCostingBatches` para
 * no restar lo que ese pedido aparto.
 *
 * No se comprueba que la receta exista ni que este viva: una receta inexistente o ajena da
 * «sin importe», igual que una receta dada de baja se cotiza sin rechazarla.
 */
export function createQuoteOrderCost(
  deps: QuoteOrderCostDeps,
): (input: unknown, actor: Actor | null | undefined) => Promise<OrderCostQuote> {
  return async function quoteOrderCost(
    input: unknown,
    actor: Actor | null | undefined,
  ): Promise<OrderCostQuote> {
    requirePermission(actor, 'pedidos.modificar');

    const parsed = quoteOrderCostSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError();
    const data = parsed.data;

    // Las lineas antiguas, sin envase, no cuestan.
    const ingredientsCost = await resolveOrderCost(
      { recipes: deps.recipes, products: deps.products, units: deps.units, packaging: deps.packaging },
      data.recipeId,
      data.quantity,
      null,
      packagingLinesOfInput(data.presentationLines ?? []),
      actor.companyId,
      { orderId: data.orderId },
    );

    return { ingredientsCost };
  };
}
