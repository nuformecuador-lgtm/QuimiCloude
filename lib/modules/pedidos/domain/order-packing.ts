// lib/modules/pedidos/domain/order-packing.ts
//
// `createStartPacking` implementa `OrderCatalog['startPackingAliveById']` sobre
// `OrderPackingRepository`: un `UPDATE` condicional fuera de la unidad de trabajo compartida con
// `inventario`, sin tocar material ni producto terminado.
//
// `createFinishPacking` implementa `OrderCatalog['finishPackingAliveById']` (Terminar, R17-R21):
// abre `OrderUnitOfWork`, mueve el estado con `OrderWriteRepository.finishPackingAlive` -en la
// MISMA transaccion- y da de alta, por cada linea del reparto, un lote de producto terminado con
// un unico coste unitario (R18). `asignaciones` solo conoce la firma de `OrderCatalog`, nunca
// este archivo.

import { addQuantities, deriveUnitCost, planFinishedGoodsLine } from '@/lib/modules/inventario';

import { PresentationWithoutContentError, RecipeNotFoundError } from './errors';
import { resolveLotIngredientsCost } from './resolve-ingredients-cost';
import { assertTransition } from './order-transitions';

import type { FinishedGoodsReceipt, OrderCatalog } from './order-catalog';

import type { OrderPackingRepository } from '../ports/order-packing-repository';
import type { FinishPackingLine } from '../ports/order-write-repository';
import type { OrderUnitOfWork } from '../ports/order-unit-of-work';

import type { PresentationCatalog, ProductCatalog } from '@/lib/modules/inventario';
import type { RecipeCatalog } from '@/lib/modules/recetas';
import type { UnitCatalog } from '@/lib/modules/unidades';

export type StartPackingDeps = {
  readonly packing: OrderPackingRepository;
};

export type FinishPackingDeps = {
  readonly packing: OrderPackingRepository;
  readonly unitOfWork: OrderUnitOfWork;
  /** Nombre de la receta y coste del lote cuando el pedido no tiene importe guardado: las dos
   *  lecturas van por los catalogos publicos, sobre el cliente global -la misma foto que veria
   *  una edicion en ese instante-, nunca sobre `scope.recipes`. Mismo criterio que tenia
   *  `transition-order.ts` antes de R15/R16. */
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  /** Solo para la defensa en profundidad de R19: una linea sin contenido copiado -imposible por
   *  la escritura normal (R22-R25, R34)- todavia puede rescatarse si la presentacion tiene HOY
   *  contenido vigente. Lectura global, fuera de la transaccion, igual que `recipes`/`products`. */
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
};

/** Firma exacta de `OrderCatalog['startPackingAliveById']`. `'without_distribution'` (R10) sale
 *  tal cual del puerto: este dominio no distingue ese caso de los demas, solo delega. */
export function createStartPacking(deps: StartPackingDeps): OrderCatalog['startPackingAliveById'] {
  return async function startPackingAliveById(id, companyId, packerId, now) {
    // La unica transicion que alcanza este metodo: falla rapido si algun dia dejara de ser legal.
    assertTransition('POR_EMPACAR', 'EN_EMPAQUE');
    return deps.packing.startPackingAlive(id, packerId, now, { companyId });
  };
}

/** Contenido resuelto de una linea: el copiado, o -defensa en profundidad de R19- el vigente de
 *  la presentacion en este instante. `null` cuando ninguno de los dos existe. */
async function resolveLineContents(
  presentations: Pick<PresentationCatalog, 'findRefs'>,
  companyId: string,
  lines: readonly FinishPackingLine[],
): Promise<ReadonlyMap<string, string | null>> {
  const missingIds = [...new Set(lines.filter((line) => line.presentationContent === null).map((line) => line.presentationId))];
  const currentById =
    missingIds.length === 0
      ? new Map<string, string | null>()
      : new Map((await presentations.findRefs(missingIds, companyId)).map((ref) => [ref.id, ref.content]));

  return new Map(
    lines.map((line) => [
      line.id,
      line.presentationContent ?? currentById.get(line.presentationId) ?? null,
    ]),
  );
}

/** Firma exacta de `OrderCatalog['finishPackingAliveById']`. */
export function createFinishPacking(deps: FinishPackingDeps): OrderCatalog['finishPackingAliveById'] {
  return async function finishPackingAliveById(id, companyId, packerId, now) {
    assertTransition('EN_EMPAQUE', 'ENTREGADO');

    try {
      return await deps.unitOfWork.run(async (scope) => {
        const updated = await scope.orders.finishPackingAlive(id, packerId, now, { companyId });
        if (updated.kind !== 'ok') return updated.kind;

        const lines = await scope.orders.findPresentationLinesForFinish(id, { companyId });
        if (lines.length === 0) return { kind: 'ok' as const, finishedGoods: [] };

        const [recipeRef] = await deps.recipes.findRefsIncludingDeleted([updated.recipeId], companyId);
        if (recipeRef === undefined) throw new RecipeNotFoundError();

        const lotCost =
          updated.ingredientsCost !== null
            ? updated.ingredientsCost
            : await resolveLotIngredientsCost(
                deps.recipes,
                deps.products,
                deps.units,
                updated.recipeId,
                updated.quantity,
                companyId,
                { orderId: id },
              );

        const contentByLineId = await resolveLineContents(deps.presentations, companyId, lines);

        // Se resuelve el contenido de CADA linea antes de escribir nada (R19: identifica la
        // linea y deshace TODO), y se acumula la cantidad total para el coste unitario unico
        // (R18) en la MISMA pasada.
        let totalQuantity = '0.0000';
        const resolvedLines: ReadonlyArray<{ readonly line: FinishPackingLine; readonly content: string }> = lines.map(
          (line) => {
            const content = contentByLineId.get(line.id) ?? null;
            if (content === null) throw new PresentationWithoutContentError(line.id);
            return { line, content };
          },
        );
        for (const { line, content } of resolvedLines) {
          const plan = planFinishedGoodsLine({ packages: line.packages, content, unitCost: '0.0000' });
          if (plan.kind === 'no_content') throw new PresentationWithoutContentError(line.id);
          totalQuantity = addQuantities(totalQuantity, plan.quantity);
        }

        // R18: un unico coste unitario para TODAS las lineas del pedido, derivado UNA sola vez
        // de la cantidad total producida. `calculateLotIngredientsCost` nunca devuelve `null`
        // (cuenta como cero cada ingrediente sin costo), asi que `lotCost` en `0.0000` es un
        // coste legitimo -y `deriveUnitCost` lo refleja devolviendo `null`-.
        const unitCost = deriveUnitCost(lotCost, totalQuantity) ?? '0.0000';

        const finishedGoods: FinishedGoodsReceipt[] = [];
        for (const { line, content } of resolvedLines) {
          const outcome = await scope.finishedGoods.receiveFromOrder({
            orderId: id,
            companyId,
            recipeId: updated.recipeId,
            recipeName: recipeRef.name,
            presentationId: line.presentationId,
            orderPresentationLineId: line.id,
            packages: line.packages,
            orderContent: content,
            unitCost,
            actorId: packerId,
            now,
          });

          if (outcome.kind === 'presentation_without_content') {
            throw new PresentationWithoutContentError(line.id);
          }
          finishedGoods.push({ productName: outcome.productName, packages: outcome.packages });
        }

        return { kind: 'ok' as const, finishedGoods };
      });
    } catch (err) {
      if (err instanceof RecipeNotFoundError) return 'recipe_not_found';
      if (err instanceof PresentationWithoutContentError) return 'presentation_without_content';
      throw err;
    }
  };
}
