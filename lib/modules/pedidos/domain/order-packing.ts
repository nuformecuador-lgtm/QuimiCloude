// lib/modules/pedidos/domain/order-packing.ts
//
// `createStartPacking` implementa `OrderCatalog['startPackingAliveById']` sobre
// `OrderPackingRepository`: un `UPDATE` condicional fuera de la unidad de trabajo compartida con
// `inventario`, sin tocar material ni producto terminado.
//
// `createFinishPacking` implementa `OrderCatalog['finishPackingAliveById']` (Terminar):
// abre `OrderUnitOfWork`, mueve el estado con `OrderWriteRepository.finishPackingAlive` -en la
// MISMA transaccion- y da de alta, por cada linea del reparto, un lote de producto terminado con
// un unico coste por unidad del pedido, expresado en la unidad de cada lote. `asignaciones` solo
// conoce la firma de `OrderCatalog`, nunca este archivo.

import { planFinishedGoodsLine } from '@/lib/modules/inventario';
import { convertQuantity, type UnitConversion } from '@/lib/modules/unidades';

import {
  IncompatibleUnitsError,
  OrderWithoutUnitError,
  PresentationWithoutContentError,
  RecipeNotFoundError,
} from './errors';
import { sumInOrderUnit } from './order-distribution';
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
   *  `transition-order.ts` cuando Finalizar daba de alta el lote. */
  readonly recipes: RecipeCatalog;
  readonly products: ProductCatalog;
  readonly units: UnitCatalog;
  /** La unidad de cada presentacion, para repartir el coste en la unidad del pedido, y el
   *  contenido vigente con el que rescatar una linea sin contenido copiado. Lectura global,
   *  fuera de la transaccion, igual que `recipes`/`products`. */
  readonly presentations: Pick<PresentationCatalog, 'findRefs'>;
};

/** Firma exacta de `OrderCatalog['startPackingAliveById']`. `'without_distribution'` sale
 *  tal cual del puerto: este dominio no distingue ese caso de los demas, solo delega. */
export function createStartPacking(deps: StartPackingDeps): OrderCatalog['startPackingAliveById'] {
  return async function startPackingAliveById(id, companyId, packerId, now) {
    // La unica transicion que alcanza este metodo: falla rapido si algun dia dejara de ser legal.
    assertTransition('POR_EMPACAR', 'EN_EMPAQUE');
    return deps.packing.startPackingAlive(id, packerId, now, { companyId });
  };
}

type ResolvedLine = {
  readonly line: FinishPackingLine;
  readonly content: string;
  readonly unitId: string;
};

/** Cada linea con su contenido -el copiado o, si falta, el vigente de la presentacion- y la
 *  unidad de su presentacion. Una linea sin ninguno de los dos contenidos deshace todo. */
async function resolveLines(
  presentations: Pick<PresentationCatalog, 'findRefs'>,
  companyId: string,
  lines: readonly FinishPackingLine[],
): Promise<readonly ResolvedLine[]> {
  const presentationIds = [...new Set(lines.map((line) => line.presentationId))];
  const refById = new Map((await presentations.findRefs(presentationIds, companyId)).map((ref) => [ref.id, ref] as const));

  return lines.map((line) => {
    const ref = refById.get(line.presentationId);
    // La clave foranea de la linea garantiza la presentacion: si falta, la base esta rota.
    if (ref === undefined) throw new Error(`finishPacking: la presentacion ${line.presentationId} no aparece`);
    const content = line.presentationContent ?? ref.content;
    if (content === null) throw new PresentationWithoutContentError(line.id);
    const plan = planFinishedGoodsLine({ packages: line.packages, content, unitCost: '0.0000' });
    if (plan.kind === 'no_content') throw new PresentationWithoutContentError(line.id);
    return { line, content, unitId: ref.unitId };
  });
}

const COST_SCALE = 4;
const UNSIGNED_DECIMAL = /^\d+(?:\.\d+)?$/;

function parseUnsigned(raw: string): { readonly unscaled: bigint; readonly scale: number } {
  if (!UNSIGNED_DECIMAL.test(raw)) throw new Error(`finishPacking: no es un decimal valido: ${JSON.stringify(raw)}`);
  const [whole = '', fraction = ''] = raw.split('.');
  return { unscaled: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

/**
 * `totalCost / quantity` con cuatro decimales, mitad arriba, sin pasar por coma flotante. No
 * usa `deriveUnitCost` porque la cantidad convertida puede traer hasta doce decimales y esa
 * funcion solo acepta los cuatro de `decimal(14,4)`. Cantidad cero o coste que redondea a cero
 * dan `'0.0000'`, el coste que ya aceptaba un lote de producto terminado.
 */
function divideCost(totalCost: string, quantity: string): string {
  const cost = parseUnsigned(totalCost);
  const amount = parseUnsigned(quantity);
  if (amount.unscaled === BigInt(0)) return '0.0000';

  const ten = BigInt(10);
  const numerator = cost.unscaled * ten ** BigInt(amount.scale + COST_SCALE);
  const denominator = amount.unscaled * ten ** BigInt(cost.scale);
  const quotient = numerator / denominator;
  const rounded = (numerator % denominator) * BigInt(2) >= denominator ? quotient + BigInt(1) : quotient;

  const factor = ten ** BigInt(COST_SCALE);
  return `${rounded / factor}.${(rounded % factor).toString().padStart(COST_SCALE, '0')}`;
}

/** Las claves foraneas de pedido y presentacion garantizan la unidad: si falta, la base esta rota. */
function requireUnit(unitById: ReadonlyMap<string, UnitConversion>, unitId: string): UnitConversion {
  const unit = unitById.get(unitId);
  if (unit === undefined) throw new Error(`finishPacking: la unidad ${unitId} no aparece`);
  return unit;
}

/**
 * Coste unitario por cada unidad de presentacion del reparto. El total producido se suma en la
 * unidad del pedido para que el coste por unidad del pedido sea uno solo; despues se expresa en
 * la unidad de cada lote, porque su existencia se guarda en esa unidad y su valor es
 * `existencia x coste unitario`. Una sola division por unidad: un lote en la unidad del pedido
 * lleva exactamente `lotCost / total`.
 */
function unitCostByPresentationUnit(
  lotCost: string,
  orderUnit: UnitConversion,
  unitById: ReadonlyMap<string, UnitConversion>,
  lines: readonly ResolvedLine[],
): ReadonlyMap<string, string> {
  const summed = sumInOrderUnit(
    orderUnit,
    lines.map(({ line, content, unitId }) => ({
      presentationId: line.presentationId,
      packages: line.packages,
      content,
      unit: requireUnit(unitById, unitId),
    })),
  );
  if (summed.kind === 'incompatible_units') throw new IncompatibleUnitsError(summed.presentationId);
  if (summed.kind === 'presentation_without_content') throw new PresentationWithoutContentError(summed.presentationId);

  const costs = new Map<string, string>();
  for (const unitId of new Set(lines.map((line) => line.unitId))) {
    const totalInLotUnit =
      unitId === orderUnit.id ? summed.total : convertQuantity(summed.total, orderUnit, requireUnit(unitById, unitId));
    costs.set(unitId, divideCost(lotCost, totalInLotUnit));
  }
  return costs;
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

        if (updated.unitId === null) throw new OrderWithoutUnitError(id);
        const resolvedLines = await resolveLines(deps.presentations, companyId, lines);

        const unitIds = [...new Set([updated.unitId, ...resolvedLines.map((line) => line.unitId)])];
        const unitById = new Map((await deps.units.findRefs(unitIds, companyId)).map((ref) => [ref.id, ref] as const));
        const unitCosts = unitCostByPresentationUnit(lotCost, requireUnit(unitById, updated.unitId), unitById, resolvedLines);

        const finishedGoods: FinishedGoodsReceipt[] = [];
        for (const { line, content, unitId } of resolvedLines) {
          const outcome = await scope.finishedGoods.receiveFromOrder({
            orderId: id,
            companyId,
            recipeId: updated.recipeId,
            recipeName: recipeRef.name,
            presentationId: line.presentationId,
            orderPresentationLineId: line.id,
            packages: line.packages,
            orderContent: content,
            unitCost: unitCosts.get(unitId) ?? '0.0000',
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
      if (err instanceof IncompatibleUnitsError) return 'incompatible_units';
      if (err instanceof OrderWithoutUnitError) return 'order_without_unit';
      throw err;
    }
  };
}
