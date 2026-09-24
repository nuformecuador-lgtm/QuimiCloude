import { requirePermission, type Actor } from './actor';
import { ValidationError } from './errors';
import { quoteOrderCostSchema } from './order-input';
import { resolveIngredientsCost } from './resolve-ingredients-cost';

import type { ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

/**
 * Solo los tres catalogos de LECTURA que `resolveIngredientsCost` necesita: sin `orders` ni
 * `presentations`, asi que este caso de uso no puede escribir ninguna fila porque no recibe
 * nada que escriba.
 */
export type QuoteOrderCostDeps = {
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
};

export type OrderCostQuote = { readonly ingredientsCost: string | null };

/**
 * Cotizacion de solo lectura del coste de ingredientes de un pedido: la misma regla que el
 * alta y la edicion aplican al guardar (`resolveIngredientsCost`), con la misma receta y la
 * misma cantidad, y con el `companyId` que llega SIEMPRE del actor de la sesion, nunca de la
 * entrada.
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

    const ingredientsCost = await resolveIngredientsCost(
      deps.recipes,
      deps.products,
      deps.units,
      data.recipeId,
      data.quantity,
      actor.companyId,
      { orderId: data.orderId },
    );

    return { ingredientsCost };
  };
}
